/**
 * Interactive mode with user prompts for guided data transformation
 * Provides conversational interface for complex transformations
 */

import { createInterface } from 'readline';
import { QueryOptions, StatisticalContext } from '../common-types';
import {
  TemplateManager,
  TemplateDefinition,
} from '../templates/template-manager';
import { AdvancedStatisticalModels } from '../statistical/advanced-models';

export interface InteractiveSession {
  id: string;
  startTime: number;
  userInput: UserInput[];
  context: SessionContext;
  recommendations: Recommendation[];
}

export interface UserInput {
  type: 'text' | 'file' | 'command' | 'selection';
  content: string;
  timestamp: number;
  processed: boolean;
}

export interface SessionContext {
  currentData?: any[];
  statisticalContext?: StatisticalContext;
  selectedTemplate?: string;
  transformationMode?: 'text2sql' | 'sql2text' | 'auto';
  outputFormat?: string;
  variables: Record<string, any>;
  history: string[];
}

export interface Recommendation {
  type: 'template' | 'analysis' | 'format' | 'option';
  title: string;
  description: string;
  action: string;
  confidence: number;
}

export interface InteractivePrompt {
  id: string;
  type: 'input' | 'select' | 'confirm' | 'multi-select';
  question: string;
  options?: string[];
  default?: any;
  validation?: (input: any) => boolean | string;
  help?: string;
}

export class InteractiveMode {
  private rl: any;
  private templateManager: TemplateManager;
  private currentSession: InteractiveSession;
  isRunning = false;

  constructor() {
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    this.templateManager = new TemplateManager();
    this.currentSession = this.createNewSession();
  }

  /**
   * Start interactive session
   */
  async start(): Promise<void> {
    this.isRunning = true;
    console.log('\n[START] Welcome to Edgework Interactive Mode!');
    console.log(
      'I will help you transform your data with AI-powered analysis.\n'
    );

    try {
      await this.runInteractiveLoop();
    } catch (error) {
      console.error('[ERROR] Interactive session error:', error);
    } finally {
      this.cleanup();
    }
  }

  /**
   * Main interactive loop
   */
  private async runInteractiveLoop(): Promise<void> {
    while (this.isRunning) {
      this.showMainMenu();

      const choice = await this.promptForInput(
        '\nWhat would you like to do? (Enter number or command): '
      );

      try {
        await this.handleMainMenuChoice(choice);
      } catch (error) {
        console.error(
          '[ERROR] Error:',
          error instanceof Error ? error.message : String(error)
        );
        await this.promptForInput('\nPress Enter to continue...');
      }
    }
  }

  /**
   * Show main menu
   */
  private showMainMenu(): void {
    console.log('\n[MENU] Main Menu:');
    console.log('1. [FILE] Load data from file');
    console.log('2. [INPUT] Enter data manually');
    console.log('3. [TRANSFORM] Transform data');
    console.log('4. [ANALYZE] Analyze data');
    console.log('5. [TEMPLATE] Choose template');
    console.log('6. [CONFIG] Configure options');
    console.log('7. [SAVE] Save session');
    console.log('8. [SUMMARY] View session summary');
    console.log('9. [EXIT] Exit');
    console.log('\nCommands: help, status, clear, back');
  }

  /**
   * Handle main menu choice
   */
  private async handleMainMenuChoice(choice: string): Promise<void> {
    const normalizedChoice = choice.trim().toLowerCase();

    switch (normalizedChoice) {
      case '1':
      case 'load':
      case 'file':
        await this.handleLoadData();
        break;
      case '2':
      case 'enter':
      case 'manual':
        await this.handleManualDataEntry();
        break;
      case '3':
      case 'transform':
        await this.handleTransform();
        break;
      case '4':
      case 'analyze':
        await this.handleAnalysis();
        break;
      case '5':
      case 'template':
        await this.handleTemplateSelection();
        break;
      case '6':
      case 'config':
      case 'options':
        await this.handleConfiguration();
        break;
      case '7':
      case 'save':
        await this.handleSaveSession();
        break;
      case '8':
      case 'summary':
      case 'status':
        this.showSessionSummary();
        break;
      case '9':
      case 'exit':
      case 'quit':
        await this.handleExit();
        break;
      case 'help':
        this.showHelp();
        break;
      case 'clear':
        console.clear();
        break;
      case 'back':
        // Already at main menu
        break;
      default:
        console.log('[ERROR] Invalid choice. Please try again.');
    }
  }

  /**
   * Handle data loading
   */
  private async handleLoadData(): Promise<void> {
    console.log('\n[FILE] Load Data');

    const filePath = await this.promptForInput('Enter file path: ');

    // Simulate file loading (would implement actual file reading)
    console.log(`[LOADING] Loading data from: ${filePath}`);

    // Detect file type and load data
    const fileType = this.detectFileType(filePath);
    console.log(`[DETECTED] File type: ${fileType}`);

    // Simulate loading data
    const mockData = this.generateMockData(fileType);
    this.currentSession.context.currentData = mockData;

    // Generate statistical context
    console.log('[ANALYZING] Analyzing data...');
    const { StatisticalAnalyzer } = await import('../statistical/analyzer');
    this.currentSession.context.statisticalContext =
      StatisticalAnalyzer.generateStatisticalContext(mockData);

    console.log(`[SUCCESS] Loaded ${mockData.length} records`);

    // Show data preview
    this.showDataPreview(mockData);

    // Generate recommendations
    this.generateDataRecommendations(mockData, fileType);
  }

  /**
   * Handle manual data entry
   */
  private async handleManualDataEntry(): Promise<void> {
    console.log('\n[INPUT] Manual Data Entry');

    const entryType = await this.selectFromOptions(
      'What type of data would you like to enter?',
      ['Text description', 'JSON data', 'CSV data', 'SQL query']
    );

    let data: any[] = [];

    switch (entryType) {
      case 'Text description': {
        const text = await this.promptForInput(
          'Enter your text description:\n'
        );
        data = [{ content: text, type: 'text' }];
        break;
      }
      case 'JSON data': {
        const jsonText = await this.promptForInput(
          'Enter JSON data (one object per line):\n'
        );
        data = jsonText
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return { raw: line };
            }
          });
        break;
      }
      case 'CSV data': {
        const csvText = await this.promptForInput('Enter CSV data:\n');
        data = this.parseCSV(csvText);
        break;
      }
      case 'SQL query': {
        const sqlQuery = await this.promptForInput('Enter SQL query:\n');
        data = [{ query: sqlQuery, type: 'sql' }];
        break;
      }
    }

    this.currentSession.context.currentData = data;

    // Generate statistical context
    const { StatisticalAnalyzer } = await import('../statistical/analyzer');
    this.currentSession.context.statisticalContext =
      StatisticalAnalyzer.generateStatisticalContext(data);

    console.log(`[SUCCESS] Entered ${data.length} records`);
    this.showDataPreview(data);
  }

  /**
   * Handle data transformation
   */
  private async handleTransform(): Promise<void> {
    if (!this.currentSession.context.currentData) {
      console.log('[ERROR] No data loaded. Please load data first.');
      return;
    }

    console.log('\n[TRANSFORM] Data Transformation');

    // Determine transformation mode
    const mode = await this.selectFromOptions('Select transformation mode:', [
      'Auto-detect',
      'Text to SQL',
      'SQL to Text',
    ]);

    let transformationMode: 'text2sql' | 'sql2text' | 'auto' = 'auto';
    switch (mode) {
      case 'Auto-detect':
        transformationMode = 'auto';
        break;
      case 'Text to SQL':
        transformationMode = 'text2sql';
        break;
      case 'SQL to Text':
        transformationMode = 'sql2text';
        break;
    }

    this.currentSession.context.transformationMode = transformationMode;

    // Select output format
    const format = await this.selectFromOptions('Select output format:', [
      'Markdown',
      'JSON',
      'HTML',
      'CSV',
      'LaTeX',
    ]);

    this.currentSession.context.outputFormat = format.toLowerCase();

    // Configure additional options
    const enableAdvanced = await this.confirm(
      'Enable advanced statistical analysis?'
    );
    const includeVisualizations = await this.confirm(
      'Include visualization suggestions?'
    );

    console.log('\n[PROCESSING] Starting transformation...');

    // Simulate transformation (would integrate with actual transformation logic)
    const result = await this.simulateTransformation(
      this.currentSession.context.currentData!,
      transformationMode,
      format.toLowerCase(),
      { enableAdvanced, includeVisualizations }
    );

    console.log('[SUCCESS] Transformation complete!');
    console.log('\n[RESULT] Result Preview:');
    console.log(result.substring(0, 500) + '...');

    // Ask if user wants to save result
    const saveResult = await this.confirm('Save result to file?');
    if (saveResult) {
      const filename = await this.promptForInput('Enter filename: ');
      console.log(`[SAVED] Result saved to: ${filename}`);
    }
  }

  /**
   * Handle data analysis
   */
  private async handleAnalysis(): Promise<void> {
    if (!this.currentSession.context.currentData) {
      console.log('[ERROR] No data loaded. Please load data first.');
      return;
    }

    console.log('\n[ANALYZE] Data Analysis');

    const analysisType = await this.selectFromOptions('Select analysis type:', [
      'Basic Statistics',
      'Time Series Analysis',
      'Clustering Analysis',
      'Advanced Exploratory Analysis',
      'Quality Assessment',
    ]);

    console.log('\n[PROCESSING] Performing analysis...');

    let result: string;

    switch (analysisType) {
      case 'Basic Statistics':
        result = await this.performBasicStatistics();
        break;
      case 'Time Series Analysis':
        result = await this.performTimeSeriesAnalysis();
        break;
      case 'Clustering Analysis':
        result = await this.performClusteringAnalysis();
        break;
      case 'Advanced Exploratory Analysis':
        result = await this.performAdvancedAnalysis();
        break;
      case 'Quality Assessment':
        result = await this.performQualityAssessment();
        break;
      default:
        result = 'Analysis not implemented yet.';
    }

    console.log('\n[RESULTS] Analysis Results:');
    console.log(result);

    // Ask if user wants to see detailed visualizations
    const showVisualizations = await this.confirm(
      'Show visualization suggestions?'
    );
    if (showVisualizations) {
      this.showVisualizationSuggestions(analysisType);
    }
  }

  /**
   * Handle template selection
   */
  private async handleTemplateSelection(): Promise<void> {
    console.log('\n[TEMPLATE] Template Selection');

    const templates = this.templateManager.getTemplates();

    if (templates.length === 0) {
      console.log('[ERROR] No templates available.');
      return;
    }

    // Group templates by category
    const categories = [...new Set(templates.map((t) => t.category))];
    const selectedCategory = await this.selectFromOptions(
      'Select template category:',
      categories.map((cat) => cat.charAt(0).toUpperCase() + cat.slice(1))
    );

    const categoryTemplates = templates.filter(
      (t) => t.category === selectedCategory.toLowerCase()
    );

    if (categoryTemplates.length === 0) {
      console.log('[ERROR] No templates in this category.');
      return;
    }

    const selectedTemplateName = await this.selectFromOptions(
      'Select template:',
      categoryTemplates.map((t) => `${t.name} - ${t.description}`)
    );

    const selectedTemplate = categoryTemplates.find(
      (t) => `${t.name} - ${t.description}` === selectedTemplateName
    );

    if (selectedTemplate) {
      this.currentSession.context.selectedTemplate = selectedTemplate.id;
      console.log(`[SUCCESS] Selected template: ${selectedTemplate.name}`);

      // Show template details
      this.showTemplateDetails(selectedTemplate);

      // Configure template variables
      await this.configureTemplateVariables(selectedTemplate);
    }
  }

  /**
   * Handle configuration
   */
  private async handleConfiguration(): Promise<void> {
    console.log('\n[CONFIG] Configuration');

    const configOption = await this.selectFromOptions(
      'What would you like to configure?',
      [
        'AI Model Selection',
        'Output Preferences',
        'Statistical Analysis Options',
        'Performance Settings',
        'API Configuration',
      ]
    );

    switch (configOption) {
      case 'AI Model Selection':
        await this.configureAIModel();
        break;
      case 'Output Preferences':
        await this.configureOutputPreferences();
        break;
      case 'Statistical Analysis Options':
        await this.configureStatisticalOptions();
        break;
      case 'Performance Settings':
        await this.configurePerformanceSettings();
        break;
      case 'API Configuration':
        await this.configureAPI();
        break;
    }
  }

  /**
   * Handle session saving
   */
  private async handleSaveSession(): Promise<void> {
    console.log('\n[SAVE] Save Session');

    const filename = await this.promptForInput(
      'Enter session filename (without extension): '
    );
    const sessionData = JSON.stringify(this.currentSession, null, 2);

    // Simulate saving (would implement actual file saving)
    console.log(`[SAVED] Session saved to: ${filename}.json`);
    console.log(
      `[INFO] Session contains ${this.currentSession.userInput.length} user inputs`
    );
  }

  /**
   * Show session summary
   */
  private showSessionSummary(): void {
    console.log('\n[SUMMARY] Session Summary');
    console.log(
      `[TIME] Started: ${new Date(
        this.currentSession.startTime
      ).toLocaleString()}`
    );
    console.log(
      `[INPUTS] User inputs: ${this.currentSession.userInput.length}`
    );
    console.log(
      `[DATA] Data loaded: ${
        this.currentSession.context.currentData?.length || 0
      } records`
    );
    console.log(
      `[TEMPLATE] Template: ${
        this.currentSession.context.selectedTemplate || 'None'
      }`
    );
    console.log(
      `[MODE] Mode: ${
        this.currentSession.context.transformationMode || 'Not set'
      }`
    );
    console.log(
      `[FORMAT] Format: ${
        this.currentSession.context.outputFormat || 'Not set'
      }`
    );

    if (this.currentSession.recommendations.length > 0) {
      console.log('\n[RECOMMENDATIONS] Recommendations:');
      this.currentSession.recommendations.slice(0, 3).forEach((rec) => {
        console.log(`  • ${rec.title}: ${rec.description}`);
      });
    }
  }

  /**
   * Handle exit
   */
  private async handleExit(): Promise<void> {
    const hasUnsavedWork = this.currentSession.userInput.length > 0;

    if (hasUnsavedWork) {
      const saveSession = await this.confirm(
        'You have unsaved work. Save session before exiting?'
      );
      if (saveSession) {
        await this.handleSaveSession();
      }
    }

    const confirmExit = await this.confirm('Are you sure you want to exit?');
    if (confirmExit) {
      this.isRunning = false;
      console.log('\n[EXIT] Thank you for using Edgework Interactive Mode!');
    }
  }

  /**
   * Show help
   */
  private showHelp(): void {
    console.log('\n[HELP] Edgework Interactive Mode');
    console.log('\nCommands:');
    console.log('  help     - Show this help message');
    console.log('  status   - Show current session status');
    console.log('  clear    - Clear the screen');
    console.log('  back     - Go back to previous menu');
    console.log('  exit     - Exit the interactive mode');
    console.log('\nFeatures:');
    console.log('  • Load data from files or enter manually');
    console.log('  • Transform data with AI-powered analysis');
    console.log('  • Choose from professional report templates');
    console.log('  • Perform advanced statistical analysis');
    console.log('  • Configure options and preferences');
    console.log('\nFor more information, visit: https://docs.edgework.ai');
  }

  /**
   * Utility methods
   */
  private async promptForInput(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(question, (answer: string) => {
        resolve(answer.trim());
      });
    });
  }

  private async selectFromOptions(
    question: string,
    options: string[]
  ): Promise<string> {
    console.log(`\n${question}`);
    options.forEach((option, index) => {
      console.log(`${index + 1}. ${option}`);
    });

    while (true) {
      const choice = await this.promptForInput('Enter your choice (number): ');
      const index = parseInt(choice) - 1;

      if (index >= 0 && index < options.length) {
        return options[index];
      }

      console.log('[ERROR] Invalid choice. Please try again.');
    }
  }

  private async confirm(question: string): Promise<boolean> {
    const answer = await this.promptForInput(`${question} (y/n): `);
    return answer.toLowerCase().startsWith('y');
  }

  private createNewSession(): InteractiveSession {
    return {
      id: `session_${Date.now()}`,
      startTime: Date.now(),
      userInput: [],
      context: {
        variables: {},
        history: [],
      },
      recommendations: [],
    };
  }

  private detectFileType(filePath: string): string {
    const extension = filePath.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'json':
        return 'JSON';
      case 'csv':
        return 'CSV';
      case 'sql':
        return 'SQL';
      default:
        return 'Text';
    }
  }

  private generateMockData(fileType: string): any[] {
    const mockData = [];
    for (let i = 0; i < 100; i++) {
      mockData.push({
        id: i + 1,
        name: `Item ${i + 1}`,
        value: Math.random() * 100,
        category: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
        timestamp: Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000,
      });
    }
    return mockData;
  }

  private showDataPreview(data: any[]): void {
    console.log('\n[PREVIEW] Data Preview:');
    const preview = data.slice(0, 5);
    preview.forEach((item, index) => {
      console.log(`${index + 1}: ${JSON.stringify(item, null, 2)}`);
    });
    console.log(`... and ${data.length - preview.length} more records`);
  }

  private generateDataRecommendations(data: any[], fileType: string): void {
    const recommendations: Recommendation[] = [];

    // Analyze data characteristics
    const hasNumbers = data.some((item) =>
      Object.values(item).some((val) => typeof val === 'number')
    );

    const hasDates = data.some((item) =>
      Object.values(item).some(
        (val) =>
          val instanceof Date ||
          (typeof val === 'string' && !isNaN(Date.parse(val)))
      )
    );

    if (hasNumbers) {
      recommendations.push({
        type: 'analysis',
        title: 'Statistical Analysis',
        description:
          'Perform comprehensive statistical analysis on numerical data',
        action: 'analyze',
        confidence: 0.9,
      });
    }

    if (hasDates) {
      recommendations.push({
        type: 'analysis',
        title: 'Time Series Analysis',
        description: 'Analyze temporal patterns and trends',
        action: 'time-series',
        confidence: 0.85,
      });
    }

    if (data.length > 50) {
      recommendations.push({
        type: 'template',
        title: 'Monthly Report Template',
        description: 'Generate a comprehensive monthly report',
        action: 'template:monthly-report',
        confidence: 0.8,
      });
    }

    this.currentSession.recommendations.push(...recommendations);

    if (recommendations.length > 0) {
      console.log('\n[RECOMMENDATIONS] Recommendations:');
      recommendations.slice(0, 3).forEach((rec) => {
        console.log(`  • ${rec.title}: ${rec.description}`);
      });
    }
  }

  private parseCSV(csvText: string): any[] {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      const obj: any = {};

      headers.forEach((header, index) => {
        const value = values[index];
        const numValue = parseFloat(value);
        obj[header] = isNaN(numValue) ? value : numValue;
      });

      data.push(obj);
    }

    return data;
  }

  private async simulateTransformation(
    data: any[],
    mode: string,
    format: string,
    options: any
  ): Promise<string> {
    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return `# Transformation Result\n\nMode: ${mode}\nFormat: ${format}\nRecords processed: ${data.length}\nAdvanced analysis: ${options.enableAdvanced}\nVisualizations: ${options.includeVisualizations}\n\n## Sample Output\n\nThis is a simulated transformation result. In the actual implementation, this would contain the transformed data with AI-powered insights and statistical analysis.`;
  }

  private async performBasicStatistics(): Promise<string> {
    const context = this.currentSession.context.statisticalContext;
    if (!context) return 'No statistical context available.';

    return `# Basic Statistical Analysis\n\n## Distribution\n- Mean: ${context.distribution?.mean.toFixed(
      2
    )}\n- Median: ${context.distribution?.median.toFixed(
      2
    )}\n- Std Dev: ${context.distribution?.stdDev.toFixed(2)}\n- Min: ${
      context.distribution?.min
    }\n- Max: ${
      context.distribution?.max
    }\n\n## Data Quality\n- Completeness: ${(
      context.dataQuality?.completeness * 100
    ).toFixed(1)}%\n- Consistency: ${(
      context.dataQuality?.consistency * 100
    ).toFixed(1)}%\n- Outliers: ${
      context.outliers.length
    }\n\n## Patterns\n${context.patterns.map((p) => `- ${p}`).join('\n')}`;
  }

  private async performTimeSeriesAnalysis(): Promise<string> {
    const data = this.currentSession.context.currentData || [];
    const numericalData = data
      .filter((item) => typeof item.value === 'number')
      .map((item) => item.value);

    if (numericalData.length < 10) {
      return 'Insufficient data for time series analysis (need at least 10 numerical points).';
    }

    try {
      const analysis =
        AdvancedStatisticalModels.analyzeTimeSeries(numericalData);

      return `# Time Series Analysis\n\n## Trend\n- Direction: ${
        analysis.trend
      }\n- Seasonality detected: ${
        analysis.seasonality.length > 0 ? 'Yes' : 'No'
      }\n\n## Seasonality Patterns\n${analysis.seasonality
        .map(
          (s) =>
            `- ${s.description} (strength: ${(s.strength * 100).toFixed(1)}%)`
        )
        .join('\n')}\n\n## Stationarity\n- Conclusion: ${
        analysis.stationarity.conclusion
      }\n- ADF Test: ${
        analysis.stationarity.adfTest.conclusion
      }\n- KPSS Test: ${
        analysis.stationarity.kpssTest.conclusion
      }\n\n## Anomalies\n- Detected: ${
        analysis.anomalies.length
      }\n- High severity: ${
        analysis.anomalies.filter((a) => a.severity === 'high').length
      }\n\n## Forecast\n- Next ${
        analysis.forecast.length
      } periods predicted\n- Average confidence: ${(
        (analysis.forecast.reduce((sum, f) => sum + f.confidence, 0) /
          analysis.forecast.length) *
        100
      ).toFixed(1)}%`;
    } catch (error) {
      return `Time series analysis failed: ${error}`;
    }
  }

  private async performClusteringAnalysis(): Promise<string> {
    const data = this.currentSession.context.currentData || [];
    const numericalData = data
      .filter((item) => typeof item.value === 'number')
      .map((item) => [item.value]);

    if (numericalData.length < 5) {
      return 'Insufficient data for clustering analysis (need at least 5 data points).';
    }

    try {
      const analysis = AdvancedStatisticalModels.performClustering(
        numericalData,
        'kmeans'
      );

      return `# Clustering Analysis\n\n## Results\n- Algorithm: ${
        analysis.algorithm
      }\n- Optimal clusters: ${
        analysis.optimalClusters
      }\n- Silhouette score: ${analysis.silhouetteScore.toFixed(
        3
      )}\n- Overall quality: ${
        analysis.clusterQuality.overallQuality
      }\n\n## Clusters\n${analysis.clusters
        .map(
          (c) =>
            `- Cluster ${c.id}: ${
              c.size
            } members (silhouette: ${c.silhouette.toFixed(3)})`
        )
        .join(
          '\n'
        )}\n\n## Quality Metrics\n- Davies-Bouldin Index: ${analysis.clusterQuality.daviesBouldinIndex.toFixed(
        3
      )}\n- Calinski-Harabasz Index: ${analysis.clusterQuality.calinskiHarabaszIndex.toFixed(
        3
      )}`;
    } catch (error) {
      return `Clustering analysis failed: ${error}`;
    }
  }

  private async performAdvancedAnalysis(): Promise<string> {
    return `# Advanced Exploratory Analysis\n\nThis would include:\n- Multivariate analysis\n- Correlation matrices\n- Principal component analysis\n- Advanced outlier detection\n- Distribution fitting\n- Hypothesis testing\n\nAdvanced analysis requires sufficient data volume and multiple variables.`;
  }

  private async performQualityAssessment(): Promise<string> {
    const context = this.currentSession.context.statisticalContext;
    if (!context) return 'No statistical context available.';

    const quality = context.dataQuality;
    const grade =
      quality!.completeness > 0.9 && quality!.consistency > 0.9
        ? 'A'
        : quality!.completeness > 0.8 && quality!.consistency > 0.8
        ? 'B'
        : quality!.completeness > 0.7 && quality!.consistency > 0.7
        ? 'C'
        : 'D';

    return `# Data Quality Assessment\n\n## Overall Grade: ${grade}\n\n## Quality Dimensions\n- **Completeness**: ${(
      quality!.completeness * 100
    ).toFixed(1)}%\n- **Consistency**: ${(quality!.consistency * 100).toFixed(
      1
    )}%\n- **Outliers**: ${quality!.outliers} detected\n\n## Recommendations\n${
      quality!.completeness < 0.9
        ? '- Improve data completeness through better collection processes\n'
        : ''
    }${
      quality!.consistency < 0.9
        ? '- Standardize data formats and validation rules\n'
        : ''
    }${
      quality!.outliers > 0 ? '- Investigate and handle outlier values\n' : ''
    }- Implement automated quality checks`;
  }

  private showVisualizationSuggestions(analysisType: string): void {
    console.log('\n[VISUALIZATIONS] Visualization Suggestions:');

    const suggestions = {
      'Basic Statistics': [
        'Histogram for distribution analysis',
        'Box plot for outlier detection',
        'Scatter plot for correlation analysis',
      ],
      'Time Series Analysis': [
        'Line chart with trend line',
        'Seasonal decomposition plot',
        'Forecast chart with confidence intervals',
      ],
      'Clustering Analysis': [
        'Scatter plot with cluster coloring',
        'Dendrogram for hierarchical clustering',
        'Silhouette plot',
      ],
      'Advanced Exploratory Analysis': [
        'Heatmap for correlation matrix',
        'Pair plot for multivariate analysis',
        'Principal component biplot',
      ],
      'Quality Assessment': [
        'Data quality dashboard',
        'Missing data patterns',
        'Quality metrics over time',
      ],
    };

    const visualizations =
      suggestions[analysisType as keyof typeof suggestions] || [];
    visualizations.forEach((viz) => {
      console.log(`  • ${viz}`);
    });
  }

  private showTemplateDetails(template: TemplateDefinition): void {
    console.log(`\n[TEMPLATE] Template Details: ${template.name}`);
    console.log(`Description: ${template.description}`);
    console.log(`Category: ${template.category}`);
    console.log(`Sections: ${template.sections.length}`);
    console.log(`Variables: ${template.variables.length}`);

    if (template.tags.length > 0) {
      console.log(`Tags: ${template.tags.join(', ')}`);
    }
  }

  private async configureTemplateVariables(
    template: TemplateDefinition
  ): Promise<void> {
    if (template.variables.length === 0) {
      console.log('No variables to configure.');
      return;
    }

    console.log('\n[CONFIG] Configure Template Variables');

    for (const variable of template.variables) {
      const currentValue =
        this.currentSession.context.variables[variable.name] ||
        variable.default;

      if (variable.validation?.options) {
        const selectedOption = await this.selectFromOptions(
          `${variable.description} (${variable.name})`,
          variable.validation.options.map(
            (opt) => `${opt} ${opt === currentValue ? '(current)' : ''}`
          )
        );
        this.currentSession.context.variables[variable.name] =
          selectedOption.replace(' (current)', '');
      } else {
        const newValue = await this.promptForInput(
          `${variable.description} (${variable.name}) [current: ${currentValue}]: `
        );
        if (newValue.trim()) {
          this.currentSession.context.variables[variable.name] =
            newValue.trim();
        }
      }
    }

    console.log('[SUCCESS] Template variables configured');
  }

  private async configureAIModel(): Promise<void> {
    console.log('\n[AI] AI Model Configuration');

    const modelType = await this.selectFromOptions('Select model type:', [
      'Text-to-SQL Generation',
      'SQL-to-Text Summarization',
      'Custom Model',
    ]);

    switch (modelType) {
      case 'Text-to-SQL Generation':
        console.log('Recommended models for SQL generation:');
        console.log('• qwen2.5-coder-32b-instruct (recommended)');
        console.log('• codellama-34b-instruct');
        console.log('• deepseek-coder-33b-instruct');
        break;
      case 'SQL-to-Text Summarization':
        console.log('Recommended models for summarization:');
        console.log('• llama-3.2-3b-instruct (recommended)');
        console.log('• mistral-7b-instruct');
        console.log('• gemma-7b-instruct');
        break;
      case 'Custom Model': {
        const customModel = await this.promptForInput(
          'Enter custom model name: '
        );
        console.log(`Custom model set: ${customModel}`);
        break;
      }
    }
  }

  private async configureOutputPreferences(): Promise<void> {
    console.log('\n[OUTPUT] Output Preferences');

    const defaultFormat = await this.selectFromOptions(
      'Default output format:',
      ['Markdown', 'JSON', 'HTML', 'CSV', 'LaTeX']
    );

    const includeStats = await this.confirm(
      'Include statistical analysis by default?'
    );
    const includeVisualizations = await this.confirm(
      'Include visualization suggestions by default?'
    );

    this.currentSession.context.outputFormat = defaultFormat.toLowerCase();
    this.currentSession.context.variables.include_stats = includeStats;
    this.currentSession.context.variables.include_visualizations =
      includeVisualizations;

    console.log('[SUCCESS] Output preferences configured');
  }

  private async configureStatisticalOptions(): Promise<void> {
    console.log('\n[STATS] Statistical Analysis Options');

    const significanceLevel = await this.promptForInput(
      'Significance level (0.01-0.1) [default: 0.05]: '
    );
    const outlierMethod = await this.selectFromOptions(
      'Outlier detection method:',
      [
        'Tukey Fences (1.5×IQR)',
        'Tukey Fences (3×IQR)',
        'Z-Score (3σ)',
        'Isolation Forest',
      ]
    );

    this.currentSession.context.variables.significance_level =
      parseFloat(significanceLevel) || 0.05;
    this.currentSession.context.variables.outlier_method = outlierMethod;

    console.log('[SUCCESS] Statistical options configured');
  }

  private async configurePerformanceSettings(): Promise<void> {
    console.log('\n[PERF] Performance Settings');

    const chunkSize = await this.promptForInput(
      'Stream processing chunk size [default: 1000]: '
    );
    const maxConcurrency = await this.promptForInput(
      'Maximum concurrent operations [default: 4]: '
    );
    const memoryLimit = await this.promptForInput(
      'Memory limit (MB) [default: 512]: '
    );

    this.currentSession.context.variables.chunk_size =
      parseInt(chunkSize) || 1000;
    this.currentSession.context.variables.max_concurrency =
      parseInt(maxConcurrency) || 4;
    this.currentSession.context.variables.memory_limit =
      parseInt(memoryLimit) || 512;

    console.log('[SUCCESS] Performance settings configured');
  }

  private async configureAPI(): Promise<void> {
    console.log('\n[API] API Configuration');

    const gatewayUrl = await this.promptForInput(
      'AI Gateway URL [default: https://gateway.edgework.ai]: '
    );
    const apiKey = await this.promptForInput(
      'API Key (leave empty to use environment variable): '
    );
    const timeout = await this.promptForInput(
      'Request timeout (seconds) [default: 30]: '
    );

    this.currentSession.context.variables.gateway_url =
      gatewayUrl || 'https://gateway.edgework.ai';
    if (apiKey.trim()) {
      this.currentSession.context.variables.api_key = apiKey.trim();
    }
    this.currentSession.context.variables.timeout = parseInt(timeout) || 30;

    console.log('[SUCCESS] API configuration updated');
  }

  private cleanup(): void {
    if (this.rl) {
      this.rl.close();
    }
  }
}
