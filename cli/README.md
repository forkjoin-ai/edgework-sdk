# Edgework CLI

The **Edgework CLI** provides terminal commands for managing the decentralized edge node and AI-powered data transformations.

## Commands

### Node Management
- **Start/Stop**: Control the local edge gateway and agent processes.
- **Status**: View node health, connected peers, and active workloads.
- **Tokens**: Manage UCAN earnings and staking balances.
- **Earnings**: View accumulated compute credits.

### Data Transformation
- **Query**: Intelligent bidirectional data transformation with statistical analysis
  - Auto-detects input type (text, JSON, SQL, CSV)
  - Supports text-to-SQL and SQL-to-text transformations
  - Integrates Twokeys exploratory data analysis
  - Multiple output formats (markdown, JSON, HTML, LaTeX, PDF)
  - Luxury report templates (executive, monthly, technical, insights)

### Media Generation
- **Media**: Generate images and videos from the edge OpenAI-compatible API
  - Writes binary files to disk (`.png`, `.mp4`) by default
  - Accepts canonical model IDs only and rejects removed misleading aliases
  - Verifies video model readiness via `/v1/models` before generating video
  - Uses API key from `EDGEWORK_API_KEY`, `EDGEWORK_API_TOKEN`, or `EW_API_KEY`
  - Supports `b64_json` and `url` response formats

## Query Command Examples

```bash
# Text-to-SQL (auto-detected)
cat data.txt | edgework query
edgework query "John Doe, age 30, lives in New York"
edgework query --table=users --create-table "User data here"

# SQL-to-Text (auto-detected)
dash query "SELECT * FROM users" | edgework query
dash query "SELECT * FROM sales" | edgework query --template=monthly-report

# Advanced options
edgework query --analyze --validate-outliers --format=html data.csv
edgework query --template=executive-summary --include-stats results.json
edgework query --mode=text2sql --recommend-types "Mixed data content"
```

## Media Command Examples

```bash
# Image generation (writes PNG only when API returns usable image output)
bun run media:image -- \
  --prompt "ultra-detailed portrait, studio lighting" \
  --model ssd-1b-lcm-int8 \
  --size 512x512 \
  --out ssd.png

# Video generation -> writes ltx.mp4
bun run media:video -- \
  --prompt "cinematic snow over mountains, aerial shot" \
  --model ltx-video \
  --size 256x256 \
  --fps 8 \
  --num-frames 24 \
  --out ltx.mp4

# Override edge URL / user id explicitly
bun run media -- video \
  --edge-url https://edge.affectively.ai \
  --user-id my-user \
  --prompt "sunrise time-lapse over ocean"
```

## Query Features

### Intelligent Detection
- **Auto Mode**: Automatically detects input type and transformation direction
- **Input Types**: Text, JSON, SQL queries, CSV data
- **Confidence Scoring**: Shows detection confidence for each input

### Statistical Analysis
- **Twokeys Integration**: Full Tukey exploratory data analysis
- **Outlier Detection**: Tukey fences and statistical outliers
- **Distribution Analysis**: Mean, median, standard deviation, quartiles
- **Pattern Recognition**: Temporal, numerical, and text patterns
- **Data Quality**: Completeness, consistency, accuracy metrics

### Export Formats
- **Markdown**: Professional reports with statistical insights
- **JSON**: Structured data for programmatic use
- **HTML**: Interactive web-ready reports
- **LaTeX**: Academic and publication-ready format
- **PDF**: High-quality document export
- **CSV**: Tabular data for spreadsheet applications

### Report Templates
- **Executive Summary**: C-level business insights
- **Monthly Report**: Comprehensive monthly analysis with trends
- **Data Analysis**: Deep statistical exploration and insights
- **Technical Summary**: Engineering-focused performance analysis
- **Insights**: Business intelligence and actionable recommendations
- **Presentation**: Slide-ready content for stakeholders
- **Audit**: Compliance and quality assessment reports
- **Quality Report**: Data quality metrics and improvements

### AI Models
- **Text-to-SQL**: `qwen2.5-coder-32b-instruct` for SQL generation
- **SQL-to-Text**: `llama-3.2-3b-instruct` for summarization
- **Custom Models**: Support for custom AI model selection

### Advanced Options
- **Statistical Analysis**: `--analyze` for deep exploratory analysis
- **Outlier Validation**: `--validate-outliers` for outlier detection
- **Type Recommendations**: `--recommend-types` for optimal data types
- **Custom Tables**: `--table` for specific table targeting
- **Table Creation**: `--create-table` for automatic table generation

## Integration

Used by the Electron Desktop App to manage the background `edgework-node` process and provide intelligent data transformation capabilities.

## Dependencies

- **Twokeys**: Statistical analysis library for exploratory data analysis
- **AI Gateway**: Cloud-based AI inference for transformations
- **Dash CLI**: Integration with local SQLite database system
