/**
 * Devonian Lens for bidirectional text ↔ SQL transformations
 * Integrates with dash-cli's lens system for structured data transformations
 */

import {
  QueryOptions,
  StatisticalContext,
  TransformationResult,
} from '../common-types';
import { StatisticalAnalyzer } from '../statistical/analyzer';
import { ContextBuilder } from '../statistical/context-builder';
import { QueryPromptBuilder } from '../query/prompt';
import { Sql2TextPromptBuilder } from '../sql2text/prompt';

interface FieldMapping {
  sourceField: string;
  targetField: string;
  description?: string;
  transformation?: string;
  constraints?: string[];
}

interface LensContext {
  options?: unknown;
}

interface Lens<TSource, TTarget> {
  id: string;
  name: string;
  source: string;
  target: string;
  version: string;
  fieldMappings: FieldMapping[];
  limitations: string[];
  forward(data: TSource, context?: LensContext): Promise<TTarget>;
  reverse(data: TTarget, context?: LensContext): Promise<TSource>;
  validateSource(data: unknown): data is TSource;
  validateTarget(data: unknown): data is TTarget;
}

// Define source and target types
interface TextData {
  content: string;
  type: 'text' | 'json' | 'csv';
  metadata?: Record<string, any>;
}

interface SQLData {
  sql: string;
  table?: string;
  schema?: Record<string, any>;
  result?: any[];
}

export class TextSQLLens implements Lens<TextData, SQLData> {
  id = 'text-sql-transform';
  name = 'Text to SQL Transformation';
  source = 'text' as const;
  target = 'sql' as const;
  version = '1.0.0';

  fieldMappings: FieldMapping[] = [
    {
      sourceField: 'content',
      targetField: 'sql',
      description: 'Transform text content into SQL statements',
      transformation: 'AI-powered generation with statistical analysis',
      constraints: ['SQLite syntax compliance', 'dash schema awareness'],
    },
    {
      sourceField: 'metadata',
      targetField: 'schema',
      description: 'Preserve metadata as schema information',
      transformation: 'Direct mapping with validation',
      constraints: ['JSON serializable'],
    },
  ];

  limitations = [
    'Complex nested structures may require normalization',
    'Large text inputs may need chunking',
    'AI model limitations affect accuracy',
    'Statistical analysis requires sufficient data volume',
  ];

  /**
   * Forward transformation: Text → SQL
   */
  async forward(data: TextData, context?: LensContext): Promise<SQLData> {
    try {
      // Parse input data
      let parsedData: any[] = [];
      if (data.type === 'json') {
        try {
          parsedData = JSON.parse(data.content);
          if (!Array.isArray(parsedData)) {
            parsedData = [parsedData];
          }
        } catch {
          throw new Error('Invalid JSON input');
        }
      } else {
        // For text and CSV, create line-based representation
        parsedData = data.content
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => ({ content: line.trim() }));
      }

      // Perform statistical analysis
      const statisticalContext =
        StatisticalAnalyzer.generateStatisticalContext(parsedData);

      // Build AI prompt with context
      const prompt = QueryPromptBuilder.buildTextToSQLPrompt(
        data.content,
        statisticalContext,
        (context?.options as QueryOptions) || {}
      );

      // Call AI service (placeholder - would integrate with actual AI gateway)
      const aiResponse = await this.callAIService(prompt, context?.options);

      if (!aiResponse.success) {
        throw new Error(`AI transformation failed: ${aiResponse.error}`);
      }

      // Parse and validate SQL result
      const sqlResult = this.parseSQLResponse(aiResponse.data ?? '');

      return {
        sql: sqlResult.sql,
        table: sqlResult.table,
        schema: sqlResult.schema,
      };
    } catch (error) {
      throw new Error(`Forward transformation failed: ${error}`);
    }
  }

  /**
   * Reverse transformation: SQL → Text
   */
  async reverse(data: SQLData, context?: LensContext): Promise<TextData> {
    try {
      // Parse SQL results
      let queryResults: any[] = [];

      if (data.result) {
        queryResults = data.result;
      } else if (data.sql) {
        // For SQL strings, we'd need to execute them (placeholder)
        queryResults = [{ sql: data.sql, type: 'sql_statement' }];
      }

      // Perform statistical analysis
      const statisticalContext =
        StatisticalAnalyzer.generateStatisticalContext(queryResults);

      // Build AI prompt for summarization
      const prompt = Sql2TextPromptBuilder.buildSqlToTextPrompt(
        queryResults,
        statisticalContext,
        (context?.options as QueryOptions) || {}
      );

      // Call AI service
      const aiResponse = await this.callAIService(prompt, context?.options);

      if (!aiResponse.success) {
        throw new Error(`AI transformation failed: ${aiResponse.error}`);
      }

      // Parse text result
      const textResult = this.parseTextResponse(aiResponse.data ?? '');

      return {
        content: textResult.summary,
        type: 'text',
        metadata: {
          insights: textResult.insights,
          statistics: statisticalContext,
          originalSql: data.sql,
          transformation: 'sql2text',
        },
      };
    } catch (error) {
      throw new Error(`Reverse transformation failed: ${error}`);
    }
  }

  /**
   * Validate text input
   */
  validateSource(data: unknown): data is TextData {
    if (typeof data !== 'object' || data === null) {
      return false;
    }

    const textData = data as TextData;

    return (
      typeof textData.content === 'string' &&
      ['text', 'json', 'csv'].includes(textData.type) &&
      textData.content.length > 0
    );
  }

  /**
   * Validate SQL input
   */
  validateTarget(data: unknown): data is SQLData {
    if (typeof data !== 'object' || data === null) {
      return false;
    }

    const sqlData = data as SQLData;

    return (
      (typeof sqlData.sql === 'string' || Array.isArray(sqlData.result)) &&
      (sqlData.table === undefined || typeof sqlData.table === 'string')
    );
  }

  /**
   * Call AI service (placeholder implementation)
   */
  private async callAIService(
    prompt: string,
    options?: unknown
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
      // This would integrate with the actual AI gateway
      // For now, return a mock response
      const mockResponse = this.generateMockResponse(prompt);

      return {
        success: true,
        data: JSON.stringify(mockResponse),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate mock AI response (for development)
   */
  private generateMockResponse(prompt: string): any {
    if (prompt.includes('text-to-SQL') || prompt.includes('Text to SQL')) {
      return {
        sql: `-- Generated SQL based on input analysis
CREATE TABLE IF NOT EXISTS imported_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

INSERT INTO imported_data (content) VALUES 
('Sample data row 1'),
('Sample data row 2');`,
        table: 'imported_data',
        confidence: 0.85,
        warnings: ['Mock response - replace with actual AI integration'],
      };
    } else {
      return {
        summary:
          'Data analysis complete. The dataset contains structured information suitable for further processing.',
        insights: [
          'Data shows consistent patterns',
          'Statistical analysis reveals normal distribution',
          'Quality metrics indicate good data integrity',
        ],
        confidence: 0.9,
      };
    }
  }

  /**
   * Parse SQL response from AI
   */
  private parseSQLResponse(response: string): {
    sql: string;
    table?: string;
    schema?: any;
  } {
    try {
      const parsed = JSON.parse(response);
      return {
        sql: parsed.sql || response,
        table: parsed.table,
        schema: parsed.columns || parsed.schema,
      };
    } catch {
      return { sql: response };
    }
  }

  /**
   * Parse text response from AI
   */
  private parseTextResponse(response: string): {
    summary: string;
    insights: string[];
  } {
    try {
      const parsed = JSON.parse(response);
      return {
        summary: parsed.summary || response,
        insights: parsed.insights || parsed.keyFindings || [],
      };
    } catch {
      return {
        summary: response,
        insights: [],
      };
    }
  }

  /**
   * Get transformation statistics
   */
  getTransformationStats(): {
    totalTransformations: number;
    successRate: number;
    averageProcessingTime: number;
    commonErrors: string[];
  } {
    // This would integrate with actual metrics collection
    return {
      totalTransformations: 0,
      successRate: 0.95,
      averageProcessingTime: 1500,
      commonErrors: ['AI service unavailable', 'Invalid input format'],
    };
  }

  /**
   * Export lens configuration
   */
  exportConfig(): Record<string, any> {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      source: this.source,
      target: this.target,
      fieldMappings: this.fieldMappings,
      limitations: this.limitations,
      capabilities: [
        'text-to-sql',
        'sql-to-text',
        'statistical-analysis',
        'schema-inference',
        'data-validation',
      ],
      supportedFormats: {
        input: ['text', 'json', 'csv'],
        output: ['sql', 'text', 'markdown', 'json'],
      },
      aiIntegration: {
        models: ['qwen2.5-coder-32b-instruct', 'llama-3.2-3b-instruct'],
        gateway: 'edgework-ai-gateway',
        statisticalAnalysis: true,
      },
    };
  }
}

/**
 * Lens factory for creating text-SQL transformations
 */
export class TextSQLLensFactory {
  static createLens(): TextSQLLens {
    return new TextSQLLens();
  }

  static getAvailableLenses(): Array<{
    id: string;
    name: string;
    description: string;
  }> {
    return [
      {
        id: 'text-sql-transform',
        name: 'Text to SQL Transformation',
        description:
          'Bidirectional transformation between text and SQL with AI enhancement',
      },
    ];
  }

  static validateLensCompatibility(
    sourceType: string,
    targetType: string
  ): boolean {
    return (
      (sourceType === 'text' && targetType === 'sql') ||
      (sourceType === 'sql' && targetType === 'text')
    );
  }
}
