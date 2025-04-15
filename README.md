# Azure DevOps User Contribution Counter

This tool analyzes repositories in your Azure DevOps organization to count unique contributors over the last 90 days. It separates internal (organization) contributors from external contributors and provides detailed statistics per repository.

## Features

- Fetches all projects and repositories from your Azure DevOps organization
- Analyzes commit history for the last 90 days
- Identifies and separates internal and external contributors
- Implements rate limiting to respect Azure DevOps API constraints
- Caches repository and commit data to avoid unnecessary API calls
- Generates detailed reports of contributor statistics

## Prerequisites

- Node.js (v14 or higher)
- TypeScript
- Azure DevOps Personal Access Token (PAT) with the following permissions:
  - Code (Read)
  - Project and Team (Read)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd <repository-name>
```

2. Install dependencies:
```bash
npm install
```

3. Compile TypeScript:
```bash
npm run build
# or
tsc
```

## Usage

Run the script with your Azure DevOps organization name and Personal Access Token (PAT):

```bash
node dist/index.js <organization-name> <pat>
```

Example:
```bash
node dist/index.js mycompany abc123def456...
```

## Output Files

The script generates several files:

1. `repositories.json`
   - Contains cached information about all repositories
   - Used to avoid refetching repository data in subsequent runs

2. `repos/` directory
   - Contains individual CSV files for each repository
   - Format: `{repository-name}-contributors.csv`
   - Stores commit information for the last 90 days

3. `unique-contributors.txt`
   - Lists all external contributors
   - Includes total count and email addresses

4. `unique-contributors-others.txt`
   - Lists all internal contributors (from your organization's domain)
   - Includes total count and email addresses

## Rate Limiting

The script implements rate limiting to respect Azure DevOps API constraints:
- Maximum 30 requests per minute
- 3-second delay between repository processing
- Automatic throttling when approaching API limits

## File Structure 