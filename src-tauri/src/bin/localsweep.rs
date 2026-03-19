use clap::{Args, Parser, Subcommand};

use localsweep_lib::{
    analyze_candidates_service, load_settings_service, save_settings_service, scan_caches_service,
    scan_ports_and_processes_service, AnalyzeCandidatesRequest,
};

#[derive(Parser)]
#[command(name = "localsweep", about = "LocalSweep CLI")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Scan,
    Analyze,
    Cache {
        #[command(subcommand)]
        command: CacheCommands,
    },
    Settings {
        #[command(subcommand)]
        command: SettingsCommands,
    },
}

#[derive(Subcommand)]
enum CacheCommands {
    Scan,
}

#[derive(Subcommand)]
enum SettingsCommands {
    Show,
    Set(SettingsSetArgs),
}

#[derive(Args)]
struct SettingsSetArgs {
    #[arg(long)]
    endpoint: Option<String>,
    #[arg(long)]
    api_key: Option<String>,
    #[arg(long)]
    model: Option<String>,
    #[arg(long)]
    timeout_seconds: Option<u64>,
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Scan => {
            let response = scan_ports_and_processes_service()?;
            println!("扫描时间: {}", response.scanned_at);
            println!("PID     CPU%   MEM(MB) PORTS            NAME            TAGS");
            for candidate in response.candidates.iter().take(40) {
                let ports = if candidate.ports.is_empty() {
                    "-".to_string()
                } else {
                    candidate
                        .ports
                        .iter()
                        .map(|item| format!("{}/{}", item.port, item.protocol))
                        .collect::<Vec<_>>()
                        .join(",")
                };
                println!(
                    "{:<7} {:>5.1} {:>8.1} {:<16} {:<15} {}",
                    candidate.pid,
                    candidate.cpu_percent,
                    candidate.memory_mb,
                    truncate(&ports, 16),
                    truncate(&candidate.process_name, 15),
                    candidate.risk_tags.join(",")
                );
            }
        }
        Commands::Analyze => {
            let scan = scan_ports_and_processes_service()?;
            let request = AnalyzeCandidatesRequest {
                scope: "all".to_string(),
                candidates: scan.candidates,
            };
            let analysis = analyze_candidates_service(request)?;
            println!("{}", analysis.summary);
            println!();
            println!("PID     RISK    RECOMMENDATION  REASON");
            let latest = scan_ports_and_processes_service()?;
            for suggestion in analysis.suggestions {
                let pid = latest
                    .candidates
                    .iter()
                    .find(|candidate| candidate.id == suggestion.candidate_id)
                    .map(|candidate| candidate.pid.to_string())
                    .unwrap_or_else(|| "-".to_string());
                println!(
                    "{:<7} {:<7} {:<15} {}",
                    pid,
                    suggestion.risk_level,
                    suggestion.recommendation,
                    truncate(&suggestion.reason, 80)
                );
            }
        }
        Commands::Cache { command } => match command {
            CacheCommands::Scan => {
                let response = scan_caches_service()?;
                println!("扫描时间: {}", response.scanned_at);
                println!("CATEGORY             FILES      SIZE(MB) PATH");
                for category in response.categories {
                    println!(
                        "{:<20} {:>8} {:>12.1} {}",
                        category.category,
                        category.file_count,
                        category.total_bytes as f64 / 1024.0 / 1024.0,
                        category.path
                    );
                }
            }
        },
        Commands::Settings { command } => match command {
            SettingsCommands::Show => {
                let settings = load_settings_service()?;
                println!("endpoint={}", settings.endpoint);
                println!("model={}", settings.model);
                println!("timeoutSeconds={}", settings.timeout_seconds);
                println!("apiKeySet={}", !settings.api_key.is_empty());
            }
            SettingsCommands::Set(args) => {
                let mut settings = load_settings_service().unwrap_or_default();
                if let Some(endpoint) = args.endpoint {
                    settings.endpoint = endpoint;
                }
                if let Some(api_key) = args.api_key {
                    settings.api_key = api_key;
                }
                if let Some(model) = args.model {
                    settings.model = model;
                }
                if let Some(timeout_seconds) = args.timeout_seconds {
                    settings.timeout_seconds = timeout_seconds;
                }
                let response = save_settings_service(settings)?;
                println!("settingsSavedAt={}", response.saved_at);
            }
        },
    }

    Ok(())
}

fn truncate(value: &str, max: usize) -> String {
    let mut chars = value.chars();
    let output = chars.by_ref().take(max).collect::<String>();
    if chars.next().is_some() && max > 1 {
        format!("{}…", output.chars().take(max - 1).collect::<String>())
    } else {
        output
    }
}
