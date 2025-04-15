# Azure DevOps User Counter

A tool to count unique contributors in Azure DevOps repositories over the last 90 days.

## Features

- Counts unique contributors across multiple repositories
- Categorizes contributors by email domains
- Supports interactive repository selection
- Caches data for better performance
- Configurable email domain patterns
- Manual repository selection via JSON file

## Prerequisites

- Node.js version 14.0.0 or higher
- Azure DevOps Personal Access Token (PAT) with appropriate permissions

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd user-count-ado
```

2. Install dependencies:
```bash
npm install
```

## Building

Build the project using ncc:
```bash
ncc buid src/index.ts
```

This will create a bundled JavaScript file in the `dist` directory.

## Usage

Run the built JavaScript file:
```bash
node dist/index.js <organization> <pat> [options]
```

### Arguments

- `organization`: Your Azure DevOps organization name
- `pat`: Your Azure DevOps Personal Access Token

### Options

- `--force-reload`: Force reload of repositories and clear cache
- `--interactive`: Enable interactive repository selection mode
- `--regex <pattern>`: Use custom regex pattern for email categorization
- `--regex-file <file>`: Read regex pattern from file

## Workflow

1. **Initial Run**
   - The script will fetch all repositories from your Azure DevOps organization
   - Creates a `repositories.json` file with all repositories
   - Each repository entry has a `selected` field (true/false)
   - The script will pause and show instructions for adjusting the repository selection

2. **Repository Selection**
   - Open `repositories.json` in a text editor
   - For each repository, set the `selected` field:
     - `true`: Include the repository in the analysis
     - `false`: Exclude the repository from the analysis
   - Save the file and run the script again without `--force-reload`

3. **Analysis**
   - The script will process only the selected repositories
   - Fetches commits from the last 90 days for each repository
   - Categorizes contributors based on email domains
   - Generates output files with the results

## Output Files

- `repositories.json`: List of all repositories with selection status
- `repos/*-contributors.csv`: Individual CSV files for each repository's contributors
- `committers-per-repo.txt`: List of committers per repository
- `unique-contributors.txt`: List of unique contributors
- `unique-contributors-others.txt`: List of unique contributors matching the regex pattern

## Important Notes

- The tool caches repository and commit data to improve performance
- Use `--force-reload` to clear the cache and fetch fresh data
- The analysis looks at commits from the last 90 days
- The default regex pattern is `/microsoft\.com$/i` for categorizing contributors
- You can use `--interactive` for a guided repository selection process

## License

ISC 