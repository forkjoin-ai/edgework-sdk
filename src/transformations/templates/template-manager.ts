/**
 * Custom template creation and management system
 * Supports dynamic template creation, validation, and rendering
 */

import { QueryOptions, StatisticalContext } from '../common-types';
import { ContextBuilder } from '../statistical/context-builder';

export interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: 'business' | 'technical' | 'analytical' | 'custom';
  version: string;
  author?: string;
  tags: string[];
  inputTypes: ('sql' | 'json' | 'csv')[];
  outputFormats: ('markdown' | 'json' | 'html' | 'latex' | 'pdf')[];
  sections: TemplateSection[];
  variables: TemplateVariable[];
  validation: TemplateValidation;
  examples: TemplateExample[];
}

export interface TemplateSection {
  id: string;
  name: string;
  description: string;
  order: number;
  required: boolean;
  prompt: string;
  outputFormat: 'text' | 'json' | 'list' | 'table';
  conditional?: {
    field: string;
    operator: 'equals' | 'contains' | 'greater' | 'less';
    value: any;
  };
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  default?: any;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    options?: any[];
  };
}

export interface TemplateValidation {
  requiredFields: string[];
  outputSchema?: any;
  customRules: ValidationRule[];
}

export interface ValidationRule {
  name: string;
  description: string;
  test: (data: any, context: any) => boolean;
  errorMessage: string;
}

export interface TemplateExample {
  name: string;
  description: string;
  input: any;
  options: any;
  expectedOutput: any;
}

export interface RenderedTemplate {
  templateId: string;
  renderedSections: RenderedSection[];
  variables: Record<string, any>;
  metadata: {
    renderTime: number;
    sectionsRendered: number;
    variablesUsed: string[];
  };
}

export interface RenderedSection {
  sectionId: string;
  name: string;
  content: string;
  format: string;
  order: number;
}

export class TemplateManager {
  private templates: Map<string, TemplateDefinition> = new Map();
  private customTemplatesPath: string;

  constructor(customTemplatesPath?: string) {
    this.customTemplatesPath = customTemplatesPath || './custom-templates';
    this.loadBuiltinTemplates();
    this.loadCustomTemplates();
  }

  /**
   * Load built-in templates
   */
  private loadBuiltinTemplates(): void {
    const builtinTemplates = [
      this.createExecutiveSummaryTemplate(),
      this.createMonthlyReportTemplate(),
      this.createDataAnalysisTemplate(),
      this.createTechnicalSummaryTemplate(),
      this.createInsightsTemplate(),
      this.createPresentationTemplate(),
      this.createAuditTemplate(),
      this.createQualityReportTemplate(),
    ];

    builtinTemplates.forEach((template) => {
      this.templates.set(template.id, template);
    });
  }

  /**
   * Load custom templates from filesystem
   */
  private loadCustomTemplates(): void {
    // Implementation would load from this.customTemplatesPath
    // For now, just log that custom templates would be loaded
    console.log(
      `Custom templates would be loaded from: ${this.customTemplatesPath}`
    );
  }

  /**
   * Create executive summary template
   */
  private createExecutiveSummaryTemplate(): TemplateDefinition {
    return {
      id: 'executive-summary',
      name: 'Executive Summary',
      description: 'C-level business insights with strategic recommendations',
      category: 'business',
      version: '1.0.0',
      tags: ['executive', 'business', 'summary', 'strategic'],
      inputTypes: ['sql', 'json'],
      outputFormats: ['markdown', 'json', 'html'],
      sections: [
        {
          id: 'overview',
          name: 'Executive Overview',
          description: '2-3 sentence high-level summary',
          order: 1,
          required: true,
          prompt:
            'Create a concise executive overview focusing on business impact and key takeaways.',
          outputFormat: 'text',
        },
        {
          id: 'key-findings',
          name: 'Key Findings',
          description: '3-5 bullet points with business impact',
          order: 2,
          required: true,
          prompt:
            'Generate 3-5 key findings with clear business impact and confidence levels.',
          outputFormat: 'list',
        },
        {
          id: 'recommendations',
          name: 'Strategic Recommendations',
          description: '2-3 actionable business recommendations',
          order: 3,
          required: true,
          prompt:
            'Provide 2-3 strategic recommendations with priority, timeline, and expected impact.',
          outputFormat: 'list',
        },
        {
          id: 'risks',
          name: 'Risk Assessment',
          description: 'Critical concerns requiring attention',
          order: 4,
          required: false,
          prompt: 'Identify key risks and mitigation strategies.',
          outputFormat: 'list',
        },
      ],
      variables: [
        {
          name: 'audience',
          type: 'string',
          description: 'Target audience for the summary',
          required: false,
          default: 'executives',
          validation: {
            options: ['executives', 'board', 'investors', 'management'],
          },
        },
        {
          name: 'timeframe',
          type: 'string',
          description: 'Time period covered by the analysis',
          required: false,
          default: 'current period',
        },
        {
          name: 'focus_areas',
          type: 'array',
          description: 'Specific areas to focus on',
          required: false,
          default: [],
        },
      ],
      validation: {
        requiredFields: ['overview', 'key-findings', 'recommendations'],
        customRules: [
          {
            name: 'business_language',
            description: 'Use business-appropriate language',
            test: (data) => {
              const text = JSON.stringify(data).toLowerCase();
              const businessTerms = [
                'revenue',
                'growth',
                'performance',
                'impact',
                'strategic',
              ];
              return businessTerms.some((term) => text.includes(term));
            },
            errorMessage: 'Content should include business-focused language',
          },
        ],
      },
      examples: [
        {
          name: 'Quarterly Performance',
          description: 'Executive summary for quarterly business review',
          input: [{ revenue: 1500000, growth: 0.15, users: 50000 }],
          options: { audience: 'executives', timeframe: 'Q4 2024' },
          expectedOutput: {
            overview:
              'Q4 2024 showed strong performance with 15% revenue growth...',
            keyFindings: [
              'Revenue exceeded targets by 15%',
              'User base grew to 50K',
            ],
            recommendations: ['Scale infrastructure to support growth'],
          },
        },
      ],
    };
  }

  /**
   * Create monthly report template
   */
  private createMonthlyReportTemplate(): TemplateDefinition {
    return {
      id: 'monthly-report',
      name: 'Monthly Report',
      description: 'Comprehensive monthly analysis with trends and comparisons',
      category: 'business',
      version: '1.0.0',
      tags: ['monthly', 'report', 'trends', 'comparisons'],
      inputTypes: ['sql', 'json'],
      outputFormats: ['markdown', 'json', 'html', 'pdf'],
      sections: [
        {
          id: 'executive-summary',
          name: 'Executive Summary',
          description: 'High-level overview for leadership',
          order: 1,
          required: true,
          prompt: 'Create a concise executive summary of monthly performance.',
          outputFormat: 'text',
        },
        {
          id: 'key-metrics',
          name: 'Key Metrics',
          description: 'KPIs with month-over-month comparisons',
          order: 2,
          required: true,
          prompt: 'Present key metrics with MoM changes and trends.',
          outputFormat: 'json',
        },
        {
          id: 'trend-analysis',
          name: 'Trend Analysis',
          description: 'Detailed trend identification and analysis',
          order: 3,
          required: true,
          prompt: 'Analyze trends and patterns in the monthly data.',
          outputFormat: 'text',
        },
        {
          id: 'quality-assessment',
          name: 'Data Quality Assessment',
          description: 'Data quality and completeness evaluation',
          order: 4,
          required: false,
          prompt: 'Assess data quality and identify any issues.',
          outputFormat: 'text',
        },
      ],
      variables: [
        {
          name: 'month',
          type: 'string',
          description: 'Month being reported',
          required: true,
        },
        {
          name: 'year',
          type: 'number',
          description: 'Year being reported',
          required: true,
        },
        {
          name: 'compare_previous',
          type: 'boolean',
          description: 'Include previous month comparison',
          required: false,
          default: true,
        },
      ],
      validation: {
        requiredFields: ['executive-summary', 'key-metrics', 'trend-analysis'],
        customRules: [],
      },
      examples: [],
    };
  }

  /**
   * Create data analysis template
   */
  private createDataAnalysisTemplate(): TemplateDefinition {
    return {
      id: 'data-analysis',
      name: 'Data Analysis',
      description: 'Deep statistical exploration with hypothesis testing',
      category: 'analytical',
      version: '1.0.0',
      tags: ['analysis', 'statistics', 'hypothesis', 'exploration'],
      inputTypes: ['sql', 'json', 'csv'],
      outputFormats: ['markdown', 'json', 'latex'],
      sections: [
        {
          id: 'data-profile',
          name: 'Data Profile',
          description: 'Complete characterization of the dataset',
          order: 1,
          required: true,
          prompt:
            'Provide a comprehensive data profile with observations, variables, and completeness.',
          outputFormat: 'json',
        },
        {
          id: 'descriptive-stats',
          name: 'Descriptive Statistics',
          description: 'Central tendency, dispersion, distribution',
          order: 2,
          required: true,
          prompt:
            'Calculate and present descriptive statistics with interpretation.',
          outputFormat: 'json',
        },
        {
          id: 'pattern-analysis',
          name: 'Pattern Analysis',
          description: 'Trends, cycles, anomalies, correlations',
          order: 3,
          required: true,
          prompt: 'Identify and analyze patterns, trends, and correlations.',
          outputFormat: 'json',
        },
        {
          id: 'statistical-tests',
          name: 'Statistical Tests',
          description: 'Significance testing where applicable',
          order: 4,
          required: false,
          prompt:
            'Perform appropriate statistical tests and interpret results.',
          outputFormat: 'json',
        },
      ],
      variables: [
        {
          name: 'significance_level',
          type: 'number',
          description: 'Statistical significance level',
          required: false,
          default: 0.05,
          validation: { min: 0.01, max: 0.1 },
        },
        {
          name: 'include_visualizations',
          type: 'boolean',
          description: 'Include visualization suggestions',
          required: false,
          default: true,
        },
      ],
      validation: {
        requiredFields: [
          'data-profile',
          'descriptive-stats',
          'pattern-analysis',
        ],
        customRules: [],
      },
      examples: [],
    };
  }

  /**
   * Create technical summary template
   */
  private createTechnicalSummaryTemplate(): TemplateDefinition {
    return {
      id: 'technical-summary',
      name: 'Technical Summary',
      description: 'Engineering-focused performance and optimization analysis',
      category: 'technical',
      version: '1.0.0',
      tags: ['technical', 'performance', 'optimization', 'engineering'],
      inputTypes: ['sql', 'json'],
      outputFormats: ['markdown', 'json', 'html'],
      sections: [
        {
          id: 'data-architecture',
          name: 'Data Architecture',
          description: 'Structure, relationships, design patterns',
          order: 1,
          required: true,
          prompt: 'Analyze the data architecture and relationships.',
          outputFormat: 'json',
        },
        {
          id: 'performance-analysis',
          name: 'Performance Analysis',
          description: 'Query performance, bottlenecks, optimization',
          order: 2,
          required: true,
          prompt: 'Analyze performance metrics and identify bottlenecks.',
          outputFormat: 'json',
        },
        {
          id: 'data-quality',
          name: 'Data Quality',
          description: 'Technical assessment of integrity and consistency',
          order: 3,
          required: true,
          prompt: 'Assess data quality from a technical perspective.',
          outputFormat: 'json',
        },
      ],
      variables: [
        {
          name: 'focus_area',
          type: 'string',
          description: 'Primary focus area for analysis',
          required: false,
          default: 'performance',
          validation: {
            options: ['performance', 'architecture', 'quality', 'all'],
          },
        },
      ],
      validation: {
        requiredFields: [
          'data-architecture',
          'performance-analysis',
          'data-quality',
        ],
        customRules: [],
      },
      examples: [],
    };
  }

  /**
   * Create insights template
   */
  private createInsightsTemplate(): TemplateDefinition {
    return {
      id: 'insights',
      name: 'Business Insights',
      description: 'Business intelligence with actionable recommendations',
      category: 'business',
      version: '1.0.0',
      tags: ['insights', 'business', 'intelligence', 'recommendations'],
      inputTypes: ['sql', 'json'],
      outputFormats: ['markdown', 'json', 'html'],
      sections: [
        {
          id: 'primary-insights',
          name: 'Primary Insights',
          description: 'Main discoveries with business impact',
          order: 1,
          required: true,
          prompt:
            'Generate primary insights with business impact and confidence levels.',
          outputFormat: 'json',
        },
        {
          id: 'predictions',
          name: 'Predictions',
          description: 'Future trend predictions based on data',
          order: 2,
          required: false,
          prompt: 'Provide predictions based on identified patterns.',
          outputFormat: 'json',
        },
        {
          id: 'recommendations',
          name: 'Actionable Recommendations',
          description: 'Specific recommendations with implementation details',
          order: 3,
          required: true,
          prompt:
            'Generate actionable recommendations with priority and timeline.',
          outputFormat: 'json',
        },
      ],
      variables: [
        {
          name: 'prediction_horizon',
          type: 'string',
          description: 'Time horizon for predictions',
          required: false,
          default: 'medium-term',
          validation: {
            options: ['short-term', 'medium-term', 'long-term'],
          },
        },
      ],
      validation: {
        requiredFields: ['primary-insights', 'recommendations'],
        customRules: [],
      },
      examples: [],
    };
  }

  /**
   * Create presentation template
   */
  private createPresentationTemplate(): TemplateDefinition {
    return {
      id: 'presentation',
      name: 'Presentation',
      description: 'Slide-ready content for stakeholder meetings',
      category: 'business',
      version: '1.0.0',
      tags: ['presentation', 'slides', 'stakeholders', 'visual'],
      inputTypes: ['sql', 'json'],
      outputFormats: ['markdown', 'json', 'html'],
      sections: [
        {
          id: 'title-slide',
          name: 'Title Slide',
          description: 'Compelling headline and key takeaway',
          order: 1,
          required: true,
          prompt:
            'Create a compelling title slide with headline and key takeaway.',
          outputFormat: 'json',
        },
        {
          id: 'key-findings',
          name: 'Key Findings',
          description: '3-5 impactful discoveries',
          order: 2,
          required: true,
          prompt: 'Generate 3-5 key findings with supporting evidence.',
          outputFormat: 'json',
        },
        {
          id: 'visuals',
          name: 'Visual Recommendations',
          description: 'Suggested charts and graphics',
          order: 3,
          required: true,
          prompt: 'Recommend appropriate visualizations for the data.',
          outputFormat: 'json',
        },
      ],
      variables: [
        {
          name: 'audience',
          type: 'string',
          description: 'Presentation audience',
          required: false,
          default: 'mixed',
          validation: {
            options: ['executive', 'technical', 'mixed'],
          },
        },
      ],
      validation: {
        requiredFields: ['title-slide', 'key-findings', 'visuals'],
        customRules: [],
      },
      examples: [],
    };
  }

  /**
   * Create audit template
   */
  private createAuditTemplate(): TemplateDefinition {
    return {
      id: 'audit',
      name: 'Audit Report',
      description: 'Compliance and quality assessment reports',
      category: 'technical',
      version: '1.0.0',
      tags: ['audit', 'compliance', 'quality', 'assessment'],
      inputTypes: ['sql', 'json'],
      outputFormats: ['markdown', 'json', 'html', 'pdf'],
      sections: [
        {
          id: 'audit-summary',
          name: 'Audit Summary',
          description: 'Overall audit assessment and rating',
          order: 1,
          required: true,
          prompt: 'Provide an overall audit summary with rating and scope.',
          outputFormat: 'json',
        },
        {
          id: 'findings',
          name: 'Audit Findings',
          description: 'Issues identified with severity and impact',
          order: 2,
          required: true,
          prompt:
            'Document audit findings with severity, impact, and recommendations.',
          outputFormat: 'json',
        },
        {
          id: 'compliance-status',
          name: 'Compliance Status',
          description: 'Regulatory and policy compliance assessment',
          order: 3,
          required: true,
          prompt: 'Assess compliance status against standards and regulations.',
          outputFormat: 'json',
        },
      ],
      variables: [
        {
          name: 'compliance_standard',
          type: 'string',
          description: 'Compliance standard being audited',
          required: false,
          default: 'internal',
        },
      ],
      validation: {
        requiredFields: ['audit-summary', 'findings', 'compliance-status'],
        customRules: [],
      },
      examples: [],
    };
  }

  /**
   * Create quality report template
   */
  private createQualityReportTemplate(): TemplateDefinition {
    return {
      id: 'quality-report',
      name: 'Quality Report',
      description: 'Data quality metrics and improvement recommendations',
      category: 'technical',
      version: '1.0.0',
      tags: ['quality', 'metrics', 'improvement', 'assessment'],
      inputTypes: ['sql', 'json'],
      outputFormats: ['markdown', 'json', 'html'],
      sections: [
        {
          id: 'quality-summary',
          name: 'Quality Summary',
          description: 'Overall quality assessment and score',
          order: 1,
          required: true,
          prompt: 'Provide an overall quality assessment with score and grade.',
          outputFormat: 'json',
        },
        {
          id: 'quality-dimensions',
          name: 'Quality Dimensions',
          description: 'Completeness, accuracy, consistency, timeliness',
          order: 2,
          required: true,
          prompt: 'Assess quality across all dimensions with scores.',
          outputFormat: 'json',
        },
        {
          id: 'recommendations',
          name: 'Improvement Recommendations',
          description: 'Specific actions for quality improvement',
          order: 3,
          required: true,
          prompt: 'Generate specific recommendations for quality improvement.',
          outputFormat: 'json',
        },
      ],
      variables: [
        {
          name: 'quality_threshold',
          type: 'number',
          description: 'Minimum acceptable quality score',
          required: false,
          default: 0.9,
          validation: { min: 0.5, max: 1.0 },
        },
      ],
      validation: {
        requiredFields: [
          'quality-summary',
          'quality-dimensions',
          'recommendations',
        ],
        customRules: [],
      },
      examples: [],
    };
  }

  /**
   * Get all available templates
   */
  getTemplates(): TemplateDefinition[] {
    return Array.from(this.templates.values());
  }

  /**
   * Get template by ID
   */
  getTemplate(id: string): TemplateDefinition | undefined {
    return this.templates.get(id);
  }

  /**
   * Create custom template
   */
  createTemplate(template: TemplateDefinition): void {
    // Validate template
    this.validateTemplate(template);

    // Add to collection
    this.templates.set(template.id, template);

    // Save to filesystem (implementation would go here)
    this.saveCustomTemplate(template);
  }

  /**
   * Validate template definition
   */
  private validateTemplate(template: TemplateDefinition): void {
    if (!template.id || !template.name) {
      throw new Error('Template must have id and name');
    }

    if (!template.sections || template.sections.length === 0) {
      throw new Error('Template must have at least one section');
    }

    // Validate sections
    template.sections.forEach((section, index) => {
      if (!section.id || !section.name) {
        throw new Error(`Section ${index} must have id and name`);
      }
    });

    // Validate variables
    template.variables.forEach((variable, index) => {
      if (!variable.name || !variable.type) {
        throw new Error(`Variable ${index} must have name and type`);
      }
    });
  }

  /**
   * Save custom template to filesystem
   */
  private saveCustomTemplate(template: TemplateDefinition): void {
    // Implementation would save to this.customTemplatesPath
    console.log(`Custom template ${template.id} would be saved to filesystem`);
  }

  /**
   * Render template with data and options
   */
  async renderTemplate(
    templateId: string,
    data: any[],
    statisticalContext: StatisticalContext,
    options: QueryOptions & { variables?: Record<string, any> } = {}
  ): Promise<RenderedTemplate> {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    const startTime = Date.now();
    const renderedSections: RenderedSection[] = [];
    const variables = {
      ...this.getDefaultVariables(template),
      ...options.variables,
    };

    // Sort sections by order
    const sortedSections = template.sections
      .filter((section) => this.shouldRenderSection(section, data, options))
      .sort((a, b) => a.order - b.order);

    // Render each section
    for (const section of sortedSections) {
      const sectionPrompt = this.buildSectionPrompt(
        section,
        data,
        statisticalContext,
        variables
      );
      const sectionContent = await this.generateSectionContent(
        sectionPrompt,
        options
      );

      renderedSections.push({
        sectionId: section.id,
        name: section.name,
        content: sectionContent,
        format: section.outputFormat,
        order: section.order,
      });
    }

    return {
      templateId,
      renderedSections,
      variables,
      metadata: {
        renderTime: Date.now() - startTime,
        sectionsRendered: renderedSections.length,
        variablesUsed: Object.keys(variables),
      },
    };
  }

  /**
   * Get default variables for template
   */
  private getDefaultVariables(
    template: TemplateDefinition
  ): Record<string, any> {
    const defaults: Record<string, any> = {};

    template.variables.forEach((variable) => {
      if (variable.default !== undefined) {
        defaults[variable.name] = variable.default;
      }
    });

    return defaults;
  }

  /**
   * Check if section should be rendered based on experiences
   */
  private shouldRenderSection(
    section: TemplateSection,
    data: any[],
    options: any
  ): boolean {
    if (!section.conditional) {
      return true;
    }

    const { field, operator, value } = section.conditional;
    const fieldValue = (options as any)[field] || (data as any)[field];

    switch (operator) {
      case 'equals':
        return fieldValue === value;
      case 'contains':
        return Array.isArray(fieldValue)
          ? fieldValue.includes(value)
          : String(fieldValue).includes(value);
      case 'greater':
        return Number(fieldValue) > Number(value);
      case 'less':
        return Number(fieldValue) < Number(value);
      default:
        return true;
    }
  }

  /**
   * Build prompt for section
   */
  private buildSectionPrompt(
    section: TemplateSection,
    data: any[],
    statisticalContext: StatisticalContext,
    variables: Record<string, any>
  ): string {
    let prompt = section.prompt;

    // Add statistical context
    const contextString = ContextBuilder.buildPrompt(
      '',
      data,
      statisticalContext,
      'sql2text'
    );
    prompt += '\n\n## Statistical Context\n' + contextString;

    // Add variables
    if (Object.keys(variables).length > 0) {
      prompt += '\n\n## Variables\n';
      Object.entries(variables).forEach(([key, value]) => {
        prompt += `${key}: ${JSON.stringify(value)}\n`;
      });
    }

    // Add output format instructions
    prompt += '\n\n## Output Format\n';
    switch (section.outputFormat) {
      case 'json':
        prompt += 'Return a JSON response with appropriate structure.';
        break;
      case 'list':
        prompt += 'Return a list of items, one per line or as a JSON array.';
        break;
      case 'table':
        prompt += 'Return data in table format with clear headers.';
        break;
      default:
        prompt += 'Return clear, well-formatted text.';
    }

    return prompt;
  }

  /**
   * Generate content for section (placeholder for AI integration)
   */
  private async generateSectionContent(
    prompt: string,
    options: any
  ): Promise<string> {
    // This would integrate with AI service
    // For now, return a mock response
    return `Generated content based on: ${prompt.substring(0, 100)}...`;
  }

  /**
   * Search templates by criteria
   */
  searchTemplates(criteria: {
    category?: string;
    tags?: string[];
    inputTypes?: string[];
    outputFormats?: string[];
  }): TemplateDefinition[] {
    return this.getTemplates().filter((template) => {
      if (criteria.category && template.category !== criteria.category) {
        return false;
      }

      if (
        criteria.tags &&
        !criteria.tags.some((tag) => template.tags.includes(tag))
      ) {
        return false;
      }

      if (
        criteria.inputTypes &&
        !criteria.inputTypes.some((type) =>
          template.inputTypes.includes(type as any)
        )
      ) {
        return false;
      }

      if (
        criteria.outputFormats &&
        !criteria.outputFormats.some((format) =>
          template.outputFormats.includes(format as any)
        )
      ) {
        return false;
      }

      return true;
    });
  }

  /**
   * Delete custom template
   */
  deleteTemplate(templateId: string): boolean {
    const template = this.getTemplate(templateId);
    if (!template) {
      return false;
    }

    // Don't allow deletion of built-in templates
    if (this.isBuiltinTemplate(templateId)) {
      throw new Error('Cannot delete built-in templates');
    }

    this.templates.delete(templateId);
    // Implementation would also delete from filesystem

    return true;
  }

  /**
   * Check if template is built-in
   */
  private isBuiltinTemplate(templateId: string): boolean {
    const builtinIds = [
      'executive-summary',
      'monthly-report',
      'data-analysis',
      'technical-summary',
      'insights',
      'presentation',
      'audit',
      'quality-report',
    ];

    return builtinIds.includes(templateId);
  }

  /**
   * Export template configuration
   */
  exportTemplate(templateId: string): string {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    return JSON.stringify(template, null, 2);
  }

  /**
   * Import template from configuration
   */
  importTemplate(templateConfig: string): void {
    try {
      const template = JSON.parse(templateConfig) as TemplateDefinition;
      this.createTemplate(template);
    } catch (error) {
      throw new Error(`Failed to import template: ${error}`);
    }
  }
}
