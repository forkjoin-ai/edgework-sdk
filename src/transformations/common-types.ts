/**
 * Core types for AI-powered bidirectional data transformations
 */

export interface QueryOptions {
  mode?: 'text2sql' | 'sql2text' | 'auto';
  table?: string;
  createTable?: boolean;
  analyze?: boolean;
  validateOutliers?: boolean;
  recommendTypes?: boolean;
  format?: 'text' | 'markdown' | 'json' | 'csv';
  template?: string;
  includeStats?: boolean;
  outlierReport?: boolean;
  model?: string;
}

export interface StatisticalContext {
  outliers: number[];
  distribution: {
    mean: number;
    median: number;
    stdDev: number;
    min: number;
    max: number;
    q1: number;
    q3: number;
    iqr: number;
  };
  patterns: string[];
  dataQuality: {
    completeness: number;
    consistency: number;
    outliers: number;
  };
}

export interface TransformationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    mode: 'text2sql' | 'sql2text';
    confidence: number;
    processingTime: number;
    statisticalContext?: StatisticalContext;
  };
}

export interface SQLGenerationResult {
  sql: string;
  table: string;
  columns: ColumnDefinition[];
  confidence: number;
  warnings?: string[];
}

export interface ColumnDefinition {
  name: string;
  type: 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB';
  nullable: boolean;
  primaryKey?: boolean;
}

export interface TextSummaryResult {
  summary: string;
  insights: string[];
  statistics?: StatisticalContext;
  format: 'text' | 'markdown' | 'json';
  template?: string;
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  sections: ReportSection[];
}

export interface ReportSection {
  id: string;
  name: string;
  type: 'summary' | 'statistics' | 'insights' | 'chart' | 'table';
  required: boolean;
}

export type InputType = 'text' | 'json' | 'sql' | 'csv';

export interface InputDetection {
  type: InputType;
  confidence: number;
  suggestedMode: 'text2sql' | 'sql2text';
}
