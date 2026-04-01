#!/usr/bin/env bun

/**
 * Intelligent bidirectional query command for edgework-sdk
 * Supports both text-to-SQL and SQL-to-text transformations with statistical analysis
 */

import { Command } from '@a0n/cli-kernel';

import ora from '@emotions-app/shared-utils/cli/spinner';
import { readFileSync } from 'fs';
import { InputDetector } from '../src/transformations/query/detector';
import {
  QueryOptions,
  InputType,
  TransformationResult,
} from '../src/transformations/common-types';
import { StatisticalAnalyzer } from '../src/transformations/statistical/analyzer';
import { ContextBuilder } from '../src/transformations/statistical/context-builder';
import { QueryPromptBuilder } from '../src/transformations/query/prompt';
import { Sql2TextPromptBuilder } from '../src/transformations/sql2text/prompt';
import {
  edgeworkProvider,
  EdgeworkRequest,
  EdgeworkResponse,
} from '../src/transformations/ai/edgework-provider';

/**
 * Helper to call Edgework AI Gateway
 */
async function callAIGateway(
  prompt: string,
  modelId: string,
  options: any
): Promise<{ success: boolean; data: string; error?: string }> {
  try {
    const request: EdgeworkRequest = {
      model: modelId,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert data assistant. Provide accurate transformations and analysis.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: options.temperature || 0.7,
      maxTokens: options.maxTokens || 4000,
    };

    if (options.apiKey) {
      edgeworkProvider.setApiKey(options.apiKey);
    }

    const response = await edgeworkProvider.makeRequest(request);

    return {
      success: true,
      data: response.content,
    };
  } catch (error: any) {
    return {
      success: false,
      data: '',
      error: error.message,
    };
  }
}
import { StreamProcessor } from '../src/transformations/streaming/stream-processor';
import { TemplateManager } from '../src/transformations/templates/template-manager';
import { AdvancedStatisticalModels } from '../src/transformations/statistical/advanced-models';
import { InteractiveMode } from '../src/transformations/interactive/interactive-mode-fixed';
import { globalCache } from '../src/transformations/performance/cache-manager';
import { chartGenerator } from '../src/transformations/visualizations/chart-generator';
import { authManager } from '../src/production/auth-manager';
import { monitoring } from '../src/production/monitoring-fixed';

const program = new Command();

program
  .name('edgework query')
  .description(
    'Intelligent bidirectional data transformation with statistical analysis'
  )
  .version('2.0.0')
  .argument('[input...]', 'Input text, file, or pipe data')
  .option(
    '-m, --mode <mode>',
    'Transformation mode: text2sql, sql2text, or auto',
    'auto'
  )
  .option('-t, --table <name>', 'Target table name for SQL generation')
  .option('-c, --create-table', 'Create new table if needed')
  .option('-a, --analyze', 'Perform deep statistical analysis')
  .option('--validate-outliers', 'Validate and report outliers')
  .option('--recommend-types', 'Recommend optimal data types')
  .option(
    '-f, --format <format>',
    'Output format: text, markdown, json, csv, html, latex, pdf',
    'markdown'
  )
  .option('--template <template>', 'Report template for SQL-to-text mode')
  .option('--include-stats', 'Include statistical analysis in output')
  .option('--outlier-report', 'Generate detailed outlier report')
  .option(
    '--model <model>',
    'Edgework AI model to use (edgework-text2sql, edgework-sql2text, edgework-universal, edgework-advanced)'
  )
  .option('--api-key <key>', 'API key for Edgework AI gateway')
  .option(
    '--gateway-url <url>',
    'Custom Edgework AI gateway URL',
    'https://gateway.edgework.ai'
  )
  // Advanced features
  .option('--stream', 'Enable real-time streaming for large datasets')
  .option('--chunk-size <size>', 'Stream processing chunk size', '1000')
  .option('--max-concurrency <num>', 'Maximum concurrent operations', '4')
  .option('--cache', 'Enable intelligent caching')
  .option('--cache-ttl <seconds>', 'Cache time-to-live', '1800')
  .option('--interactive', 'Start interactive mode')
  .option('--session <file>', 'Load saved interactive session')
  .option('--time-series', 'Perform time series analysis')
  .option(
    '--forecast-horizon <periods>',
    'Forecast periods for time series',
    '10'
  )
  .option('--clustering', 'Perform clustering analysis')
  .option(
    '--algorithm <algo>',
    'Clustering algorithm (kmeans, hierarchical, dbscan, gaussian)',
    'kmeans'
  )
  .option('--max-clusters <num>', 'Maximum number of clusters', '8')
  .option('--visualize', 'Generate data visualizations')
  .option(
    '--chart-type <type>',
    'Chart type (line, bar, pie, scatter, histogram, box, heatmap, area, bubble)',
    'auto'
  )
  .option(
    '--chart-format <format>',
    'Chart output format (svg, html, json, canvas, png, pdf)',
    'svg'
  )
  .option('--dashboard', 'Generate multi-chart dashboard')
  .option('--quality-assessment', 'Perform data quality assessment')
  .option('--monitor-performance', 'Monitor and report performance metrics')
  // Production features
  .option('--auth-key <key>', 'Edgework API authentication key')
  .option('--user-id <id>', 'User ID for tracking and rate limiting')
  .option('--request-id <id>', 'Custom request ID for tracking')
  .option('--enable-monitoring', 'Enable production monitoring and logging')
  .option('--health-check', 'Perform system health check')
  .option('--metrics', 'Show current system metrics')
  .option('--logs', 'Show recent logs')
  .option('--alerts', 'Show active alerts')
  .action(async (args, options) => {
    try {
      await executeQuery(args, options);
    } catch (error) {
      console.error(
        `\x1b[31mError:\x1b[0m`,
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  });

program.parse();

/**
 * Main query execution function
 */
async function executeQuery(args: string[], options: any): Promise<void> {
  // Handle production commands first
  if (options.healthCheck) {
    const health = monitoring.healthCheck();
    console.log(`\x1b[34mSystem Health:\x1b[0m`);
    console.log(`Status: ${health.status}`);
    console.log(`Uptime: ${(health.uptime / 1000).toFixed(0)}s`);
    console.log(`Version: ${health.version}`);
    console.log('\nChecks:');
    Object.entries(health.checks).forEach(([check, passed]) => {
      console.log(`${passed ? '✓' : '✗'} ${check}`);
    });
    return;
  }

  if (options.metrics) {
    const metrics = monitoring.getMetrics();
    console.log(`\x1b[34mSystem Metrics:\x1b[0m`);
    console.log(JSON.stringify(metrics, null, 2));
    return;
  }

  if (options.logs) {
    const logs = monitoring.getLogs({ limit: 50 });
    console.log(`\x1b[34mRecent Logs:\x1b[0m`);
    logs.forEach((log) => {
      const timestamp = log.timestamp.toISOString();
      const level = log.level.toUpperCase().padEnd(5);
      console.log(`[${timestamp}] ${level}: ${log.message}`);
    });
    return;
  }

  if (options.alerts) {
    const alerts = monitoring.getAlerts();
    console.log(`\x1b[34mActive Alerts:\x1b[0m`);
    if (alerts.length === 0) {
      console.log('No active alerts');
    } else {
      alerts.forEach((alert) => {
        const timestamp = alert.timestamp.toISOString();
        console.log(
          `[${timestamp}] ${alert.severity.toUpperCase()}: ${alert.message}`
        );
      });
    }
    return;
  }

  // Handle interactive mode first
  if (options.interactive) {
    const interactiveMode = new InteractiveMode();
    await interactiveMode.start();
    return;
  }

  const spinner = ora('Initializing Edgework Query transformation...').start();
  const requestId =
    options.requestId ||
    `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Production monitoring setup
    if (options.enableMonitoring) {
      monitoring.startRequest(requestId, options.userId);
    }

    // Authentication
    let user;
    if (options.authKey) {
      const authResult = await authManager.authenticate(options.authKey);
      if (!authResult.success) {
        spinner.fail('Authentication failed');
        console.error(`\x1b[31mAuth Error:\x1b[0m`, authResult.error);
        if (authResult.rateLimitStatus) {
          console.error(
            `\x1b[33mRate Limit:\x1b[0m`,
            `Resets at ${authResult.rateLimitStatus.resetTime.toISOString()}`
          );
        }
        process.exit(1);
      }
      user = authResult.user;
      spinner.succeed('Authentication successful');
    }

    // Setup Edgework AI provider
    if (options.apiKey) {
      edgeworkProvider.setApiKey(options.apiKey);
    }

    // Setup caching if enabled
    if (options.cache) {
      spinner.text = 'Enabling intelligent caching...';
      // Cache is already initialized as globalCache
      spinner.succeed('Caching enabled');
    }

    // Get input data
    spinner.text = 'Loading input data...';
    const inputData = await getInputData(args);
    spinner.succeed('Input data loaded');

    // Handle streaming for large datasets
    if (options.stream) {
      spinner.text = 'Starting streaming processing...';
      await handleStreaming(inputData, options, requestId, user?.id);
      return;
    }

    // Detect input type and determine mode
    const detection = InputDetector.detectInputType(inputData);
    const mode = InputDetector.getTransformationMode(detection, options.mode);

    console.log(
      `\x1b[34mDetected: ${detection.type} (confidence: ${(
        detection.confidence * 100
      ).toFixed(1)}%)\x1b[0m`
    );
    console.log(`\x1b[34mMode: ${mode.toUpperCase()}\x1b[0m`);

    // Analyze input characteristics
    const characteristics =
      InputDetector.analyzeInputCharacteristics(inputData);
    console.log(
      `\x1b[90mInput: ${characteristics.lines} lines, ${characteristics.length} chars\x1b[0m`
    );

    // Parse data for analysis
    let parsedData: any[] = [];
    try {
      parsedData = JSON.parse(inputData);
      if (!Array.isArray(parsedData)) {
        parsedData = [parsedData];
      }
    } catch {
      // For non-JSON input, create array representation
      parsedData = inputData
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => ({ content: line.trim() }));
    }

    // Check cache first if enabled
    let cacheKey: string | undefined;
    if (options.cache) {
      cacheKey = generateCacheKey(inputData, options);
      const cachedResult = globalCache.get(cacheKey);
      if (cachedResult) {
        spinner.succeed('Retrieved from cache');
        console.log(`\x1b[32m✓ Using cached result\x1b[0m`);
        const output = formatOutput(cachedResult, options.format || 'markdown');
        console.log(output);

        if (options.enableMonitoring) {
          monitoring.endRequest(requestId, true, 0, user?.id);
        }
        return;
      }
    }

    // Perform statistical analysis
    spinner.text = 'Performing statistical analysis...';
    const statisticalContext =
      StatisticalAnalyzer.generateStatisticalContext(parsedData);
    spinner.succeed('Statistical analysis complete');

    // Perform advanced analysis if requested
    const advancedAnalysis: any = {};
    if (options.timeSeries) {
      spinner.text = 'Performing time series analysis...';
      const numericalData = parsedData
        .filter((item) => typeof item.value === 'number')
        .map((item) => item.value);

      if (numericalData.length >= 10) {
        advancedAnalysis.timeSeries =
          AdvancedStatisticalModels.analyzeTimeSeries(numericalData, {
            forecastHorizon: parseInt(options.forecastHorizon) || 10,
          });
      }
      spinner.succeed('Time series analysis complete');
    }

    if (options.clustering) {
      spinner.text = 'Performing clustering analysis...';
      const numericalData = parsedData
        .filter((item) => typeof item.value === 'number')
        .map((item) => [item.value]);

      if (numericalData.length >= 5) {
        advancedAnalysis.clustering =
          AdvancedStatisticalModels.performClustering(
            numericalData,
            options.algorithm || 'kmeans',
            { maxClusters: parseInt(options.maxClusters) || 8 }
          );
      }
      spinner.succeed('Clustering analysis complete');
    }

    if (options.qualityAssessment) {
      spinner.text = 'Performing data quality assessment...';
      advancedAnalysis.quality = {
        grade: calculateDataQualityGrade(statisticalContext),
        completeness: statisticalContext.dataQuality?.completeness || 0,
        consistency: statisticalContext.dataQuality?.consistency || 0,
        outliers: statisticalContext.outliers.length,
      };
      spinner.succeed('Quality assessment complete');
    }

    // Execute transformation based on mode
    let result: TransformationResult;

    if (mode === 'text2sql') {
      result = await executeTextToSQL(
        inputData,
        parsedData,
        statisticalContext,
        options
      );
    } else {
      result = await executeSQLToText(parsedData, statisticalContext, options);
    }

    // Add advanced analysis to result
    if (Object.keys(advancedAnalysis).length > 0) {
      result.data = {
        ...result.data,
        advancedAnalysis,
      };
    }

    // Generate visualizations if requested
    if (options.visualize || options.dashboard) {
      spinner.text = 'Generating visualizations...';
      const visualizations = await generateVisualizations(parsedData, options);
      result.data = {
        ...result.data,
        visualizations,
      };
      spinner.succeed('Visualizations generated');
    }

    // Cache result if enabled
    if (options.cache && cacheKey) {
      globalCache.set(cacheKey, result, parseInt(options.cacheTtl) * 1000);
    }

    // Handle result
    if (result.success && result.data) {
      spinner.text = 'Formatting output...';
      const output = formatOutput(result.data, options.format || 'markdown');
      spinner.succeed('Transformation complete');

      console.log(output);

      // Record usage if authenticated
      if (user) {
        const estimatedTokens = estimateTokenUsage(
          typeof inputData === 'string' ? inputData : JSON.stringify(inputData),
          output
        );
        authManager.recordUsage(user.id, estimatedTokens);
      }

      // Show performance metrics if requested
      if (options.monitorPerformance) {
        showPerformanceMetrics();
      }

      // End monitoring
      if (options.enableMonitoring) {
        monitoring.endRequest(requestId, true, 0, user?.id);
      }
    } else {
      spinner.fail('Transformation failed');
      console.error(`\x1b[31mError:\x1b[0m`, result.error);

      if (options.enableMonitoring) {
        monitoring.recordError(
          new Error(result.error || 'Unknown error'),
          { requestId, mode },
          user?.id,
          requestId
        );
        monitoring.endRequest(requestId, false, 0, user?.id);
      }

      process.exit(1);
    }
  } catch (error) {
    spinner.fail('Query execution failed');

    if (options.enableMonitoring) {
      monitoring.recordError(
        error instanceof Error ? error : new Error(String(error)),
        { requestId },
        options.userId,
        requestId
      );
      monitoring.endRequest(requestId, false, 0, options.userId);
    }

    throw error;
  }
}

function estimateTokenUsage(inputText: string, outputText: string): number {
  // Approximation: ~4 characters per token for English-like text.
  const inputTokens = Math.ceil(inputText.length / 4);
  const outputTokens = Math.ceil(outputText.length / 4);
  return Math.max(1, inputTokens + outputTokens);
}

/**
 * Execute text-to-SQL transformation
 */
async function executeTextToSQL(
  input: string,
  parsedData: any[],
  statisticalContext: any,
  options: any
): Promise<TransformationResult> {
  const spinner = ora('Converting text to SQL...').start();

  try {
    // Build prompt based on input type
    const detection = InputDetector.detectInputType(input);
    const prompt = QueryPromptBuilder.buildSpecializedPrompt(
      input,
      detection.type as 'json' | 'csv' | 'text',
      statisticalContext,
      options as QueryOptions
    );

    // Call AI gateway
    const aiResponse = await callAIGateway(
      prompt,
      options.model || 'qwen2.5-coder-32b-instruct',
      options
    );

    if (!aiResponse.success) {
      throw new Error(`AI Gateway error: ${aiResponse.error}`);
    }

    // Parse AI response
    let sqlResult;
    try {
      sqlResult = JSON.parse(aiResponse.data || '{}');
    } catch (parseError) {
      throw new Error(`Failed to parse AI response: ${parseError}`);
    }

    spinner.succeed('SQL generation complete');

    return {
      success: true,
      data: sqlResult,
      metadata: {
        mode: 'text2sql',
        confidence: sqlResult.confidence || 0.8,
        processingTime: Date.now(),
        statisticalContext,
      },
    };
  } catch (error) {
    spinner.fail('SQL generation failed');
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Execute SQL-to-text transformation
 */
async function executeSQLToText(
  data: any[],
  statisticalContext: any,
  options: any
): Promise<TransformationResult> {
  const spinner = ora('Converting SQL data to text...').start();

  try {
    // Build prompt based on template
    const prompt = Sql2TextPromptBuilder.buildSqlToTextPrompt(
      data,
      statisticalContext,
      options as QueryOptions
    );

    // Call AI gateway
    const aiResponse = await callAIGateway(
      prompt,
      options.model || 'llama-3.2-3b-instruct',
      options
    );

    if (!aiResponse.success) {
      throw new Error(`AI Gateway error: ${aiResponse.error}`);
    }

    // Parse AI response
    let textResult;
    try {
      textResult = JSON.parse(aiResponse.data || '{}');
    } catch (parseError) {
      throw new Error(`Failed to parse AI response: ${parseError}`);
    }

    spinner.succeed('Text generation complete');

    return {
      success: true,
      data: textResult,
      metadata: {
        mode: 'sql2text',
        confidence: textResult.confidence || 0.8,
        processingTime: Date.now(),
        statisticalContext,
      },
    };
  } catch (error) {
    spinner.fail('Text generation failed');
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get input data from arguments, file, or stdin
 */
async function getInputData(args: string[]): Promise<string> {
  // Check if data is being piped in
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString();
  }

  // Check if file path provided
  if (args.length > 0) {
    const firstArg = args[0];
    try {
      return readFileSync(firstArg, 'utf-8');
    } catch (error) {
      throw new Error(`Could not read file: ${firstArg}`);
    }
  }

  // Return concatenated arguments
  return args.join(' ');
}

/**
 * Format output based on format type
 */
function formatOutput(data: any, format: string): string {
  switch (format.toLowerCase()) {
    case 'json':
      return JSON.stringify(data, null, 2);
    case 'csv':
      return convertToCSV(data);
    case 'html':
      return convertToHTML(data);
    case 'latex':
      return convertToLatex(data);
    case 'pdf':
      return convertToPDF(data);
    case 'text':
      return convertToText(data);
    case 'markdown':
    default:
      return convertToMarkdown(data);
  }
}

/**
 * Convert data to CSV format
 */
function convertToCSV(data: any): string {
  if (typeof data === 'object' && data.sql) {
    // SQL result
    return data.sql;
  }

  // Text summary result
  if (typeof data === 'object' && data.summary) {
    const rows = [
      'Metric,Value',
      `Summary,"${data.summary}"`,
      `Insights,${(data.insights || []).join('; ')}`,
    ];
    return rows.join('\n');
  }

  return JSON.stringify(data);
}

/**
 * Convert data to HTML format
 */
function convertToHTML(data: any): string {
  if (typeof data === 'object' && data.summary) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Data Summary</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .summary { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .insights { margin-top: 20px; }
        .insight { background: #e7f3ff; padding: 10px; margin: 5px 0; border-radius: 3px; }
    </style>
</head>
<body>
    <div class="summary">
        <h2>Data Summary</h2>
        <p>${data.summary}</p>
    </div>
    <div class="insights">
        <h3>Key Insights</h3>
        ${(data.insights || [])
          .map((insight) => `<div class="insight">${insight}</div>`)
          .join('')}
    </div>
</body>
</html>`;
  }

  return `<pre>${JSON.stringify(data, null, 2)}</pre>`;
}

/**
 * Convert data to LaTeX format
 */
function convertToLatex(data: any): string {
  if (typeof data === 'object' && data.summary) {
    return `
\\documentclass{article}
\\usepackage{geometry}
\\geometry{a4paper, margin=1in}

\\begin{document}
\\title{Data Analysis Summary}
\\author{Edgework SDK}
\\maketitle

\\section{Summary}
${data.summary}

\\section{Key Insights}
${(data.insights || []).map((insight) => `\\item ${insight}`).join('\n')}

\\end{document}`;
  }

  return `\\begin{verbatim}\n${JSON.stringify(data, null, 2)}\n\\end{verbatim}`;
}

/**
 * Convert data to PDF format (placeholder)
 */
function convertToPDF(data: any): string {
  // Current behavior: return markdown with PDF note
  return `% PDF Export\n\n${convertToMarkdown(
    data
  )}\n\n% Note: Actual PDF generation would require a PDF library`;
}

/**
 * Convert data to plain text format
 */
function convertToText(data: any): string {
  if (typeof data === 'object' && data.sql) {
    return data.sql;
  }

  if (typeof data === 'object' && data.summary) {
    let text = `DATA SUMMARY\n${'='.repeat(50)}\n\n`;
    text += `${data.summary}\n\n`;

    if (data.insights && data.insights.length > 0) {
      text += `KEY INSIGHTS\n${'-'.repeat(30)}\n`;
      data.insights.forEach((insight: string, index: number) => {
        text += `${index + 1}. ${insight}\n`;
      });
    }

    return text;
  }

  return JSON.stringify(data, null, 2);
}

/**
 * Convert data to Markdown format
 */
function convertToMarkdown(data: any): string {
  if (typeof data === 'object' && data.sql) {
    return `# Generated SQL\n\n\`\`\`sql\n${data.sql}\n\`\`\``;
  }

  if (typeof data === 'object' && data.summary) {
    let markdown = `# Data Analysis Summary\n\n`;
    markdown += `${data.summary}\n\n`;

    if (data.insights && data.insights.length > 0) {
      markdown += `## Key Insights\n\n`;
      data.insights.forEach((insight: string) => {
        markdown += `- ${insight}\n`;
      });
    }

    if (data.statistics) {
      markdown += `\n## Statistical Analysis\n\n\`\`\`json\n${JSON.stringify(
        data.statistics,
        null,
        2
      )}\n\`\`\``;
    }

    return markdown;
  }

  return `# Result\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``;
}

/**
 * Generate cache key for input and options
 */
function generateCacheKey(input: string, options: any): string {
  const keyData = {
    input: input.substring(0, 1000), // First 1000 chars
    mode: options.mode,
    model: options.model,
    format: options.format,
    analyze: options.analyze,
    timeSeries: options.timeSeries,
    clustering: options.clustering,
    visualize: options.visualize,
  };
  return Buffer.from(JSON.stringify(keyData)).toString('base64');
}

/**
 * Handle streaming processing
 */
async function handleStreaming(
  input: string,
  options: any,
  requestId: string,
  userId?: string
): Promise<void> {
  const spinner = ora('Processing stream...').start();

  try {
    const streamProcessor = new StreamProcessor({
      chunkSize: parseInt(options.chunkSize) || 1000,
      maxConcurrency: parseInt(options.maxConcurrency) || 4,
      enableIncrementalStats: true,
    });

    // Create a readable stream from input
    const inputStream = {
      [Symbol.asyncIterator]: async function* () {
        const lines = input.split('\n');
        for (const line of lines) {
          yield line;
        }
      },
    };

    const result = await streamProcessor.processStream(
      inputStream,
      async (chunk) => {
        // Process each chunk with Edgework AI
        const chunkResult = await callAIGateway(
          JSON.stringify(chunk),
          options.model || 'edgework-universal',
          options
        );
        return chunkResult.success ? chunkResult.data : '';
      },
      (progress) => {
        spinner.text = `Processing: ${progress.percentage.toFixed(1)}% (${
          progress.processed
        }/${progress.total})`;
      }
    );

    spinner.succeed('Streaming complete');
    console.log(`\x1b[32m✓ Processed ${result.totalChunks} chunks\x1b[0m`);
    console.log(`\x1b[32m✓ Total records: ${result.totalRecords}\x1b[0m`);
    console.log(`\x1b[32m✓ Processing time: ${result.totalTime}ms\x1b[0m`);

    if (result.incrementalStats) {
      console.log(`\x1b[34mIncremental Statistics:\x1b[0m`);
      console.log(JSON.stringify(result.incrementalStats, null, 2));
    }

    // End monitoring for streaming
    if (options.enableMonitoring) {
      monitoring.endRequest(requestId, true, result.totalTime, userId);
    }
  } catch (error) {
    spinner.fail('Streaming failed');

    if (options.enableMonitoring) {
      monitoring.recordError(
        error instanceof Error ? error : new Error(String(error)),
        { requestId, operation: 'streaming' },
        userId,
        requestId
      );
      monitoring.endRequest(requestId, false, 0, userId);
    }

    throw error;
  }
}

/**
 * Generate visualizations
 */
async function generateVisualizations(data: any[], options: any): Promise<any> {
  const visualizations: any = {};

  if (options.dashboard) {
    // Generate dashboard with multiple charts
    const charts = [
      { type: 'line', xField: 'x', yField: 'y', title: 'Trend Analysis' },
      {
        type: 'bar',
        xField: 'category',
        yField: 'value',
        title: 'Category Distribution',
      },
      { type: 'pie', xField: 'type', yField: 'count', title: 'Type Breakdown' },
    ];

    visualizations.dashboard = chartGenerator.generateDashboard(data, charts, {
      format: options.chartFormat || 'svg',
      responsive: true,
    });
  } else {
    // Generate single chart
    const chartType = options.chartType === 'auto' ? 'line' : options.chartType;
    const chartFormat = options.chartFormat || 'svg';

    // Detect numeric fields for chart generation
    const numericFields = Object.keys(data[0] || {}).filter(
      (key) => typeof data[0][key] === 'number'
    );

    if (numericFields.length >= 2) {
      visualizations.chart = chartGenerator.generateScatterPlot(
        data,
        numericFields[0],
        numericFields[1],
        { title: `${numericFields[1]} vs ${numericFields[0]}` },
        { format: chartFormat }
      );
    } else if (numericFields.length === 1) {
      visualizations.chart = chartGenerator.generateHistogram(
        data.map((item) => item[numericFields[0]]),
        numericFields[0],
        20,
        { title: `Distribution of ${numericFields[0]}` },
        { format: chartFormat }
      );
    } else {
      visualizations.chart = chartGenerator.generateBarChart(
        data,
        Object.keys(data[0])[0],
        Object.keys(data[0])[1],
        { title: 'Data Overview' },
        { format: chartFormat }
      );
    }
  }

  return visualizations;
}

/**
 * Calculate data quality grade
 */
function calculateDataQualityGrade(statisticalContext: any): string {
  const quality = statisticalContext.dataQuality;
  if (!quality) return 'C';

  const completeness = quality.completeness || 0;
  const consistency = quality.consistency || 0;
  const outlierRatio = (quality.outliers || 0) / 100;

  if (completeness > 0.9 && consistency > 0.9 && outlierRatio < 0.05)
    return 'A';
  if (completeness > 0.8 && consistency > 0.8 && outlierRatio < 0.1) return 'B';
  if (completeness > 0.7 && consistency > 0.7 && outlierRatio < 0.2) return 'C';
  return 'D';
}

/**
 * Show performance metrics
 */
function showPerformanceMetrics(): void {
  const cacheStats = globalCache.getStats();

  console.log(`\x1b[34m\n[PERFORMANCE] Performance Metrics:\x1b[0m`);
  console.log(`Cache Hit Rate: ${(cacheStats.hitRate * 100).toFixed(1)}%`);
  console.log(`Cache Entries: ${cacheStats.entryCount}`);
  console.log(
    `Cache Size: ${(cacheStats.totalSize / 1024 / 1024).toFixed(2)} MB`
  );
  console.log(`Total Requests: ${cacheStats.hits + cacheStats.misses}`);

  const memUsage = process.memoryUsage();
  console.log(
    `Memory Usage: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`
  );
  console.log(`CPU Time: ${process.cpuUsage().user / 1000000}ms`);
}
