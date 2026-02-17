/* eslint-disable design-system/no-hardcoded-colors -- visualization chart colors are data-driven, not UI theme colors */
/**
 * Advanced visualization generation system
 * Creates charts, graphs, and visual representations of data
 */

export interface ChartConfig {
  type:
    | 'line'
    | 'bar'
    | 'pie'
    | 'scatter'
    | 'histogram'
    | 'box'
    | 'heatmap'
    | 'area'
    | 'bubble';
  title: string;
  width?: number;
  height?: number;
  theme?: 'light' | 'dark' | 'colorful';
  interactive?: boolean;
  animated?: boolean;
}

export interface DataSeries {
  name: string;
  data: Array<{
    x: unknown;
    y: unknown;
    label?: string;
    color?: string;
    z?: unknown;
    value?: unknown;
  }>;
  type:
    | 'line'
    | 'bar'
    | 'scatter'
    | 'area'
    | 'pie'
    | 'box'
    | 'heatmap'
    | 'bubble';
  color?: string;
  yAxis?: string;
}

export interface VisualizationOptions {
  format: 'svg' | 'canvas' | 'html' | 'json' | 'png' | 'pdf';
  responsive?: boolean;
  legend?: boolean;
  tooltips?: boolean;
  grid?: boolean;
  axisLabels?: boolean;
  dataLabels?: boolean;
}

export interface ChartData {
  title: string;
  type: string;
  config: ChartConfig;
  series: DataSeries[];
  xAxis: {
    label: string;
    type: 'category' | 'value' | 'time';
    min?: number;
    max?: number;
  };
  yAxis: {
    label: string;
    type: 'value' | 'log' | 'category';
    min?: number;
    max?: number;
  };
  metadata?: Record<string, any>;
}

export class ChartGenerator {
  private defaultOptions: VisualizationOptions = {
    format: 'svg',
    responsive: true,
    legend: true,
    tooltips: true,
    grid: true,
    axisLabels: true,
    dataLabels: false,
  };

  /**
   * Generate line chart
   */
  generateLineChart(
    data: any[],
    xField: string,
    yField: string,
    config: Partial<ChartConfig> = {},
    options: Partial<VisualizationOptions> = {}
  ): string {
    const chartConfig: ChartConfig = {
      type: 'line',
      title: `${yField} over ${xField}`,
      width: 800,
      height: 400,
      theme: 'light',
      interactive: true,
      animated: true,
      ...config,
    };

    const chartData: ChartData = {
      title: chartConfig.title,
      type: 'line',
      config: chartConfig,
      series: [
        {
          name: yField,
          data: data.map((item) => ({
            x: item[xField],
            y: item[yField],
            label: item[xField],
          })),
          type: 'line',
          color: '#3b82f6',
        },
      ],
      xAxis: {
        label: xField,
        type: this.inferAxisType(data, xField),
      },
      yAxis: {
        label: yField,
        type: 'value',
      },
    };

    return this.renderChart(chartData, { ...this.defaultOptions, ...options });
  }

  /**
   * Generate bar chart
   */
  generateBarChart(
    data: any[],
    xField: string,
    yField: string,
    config: Partial<ChartConfig> = {},
    options: Partial<VisualizationOptions> = {}
  ): string {
    const chartConfig: ChartConfig = {
      type: 'bar',
      title: `${yField} by ${xField}`,
      width: 800,
      height: 400,
      theme: 'light',
      interactive: true,
      animated: true,
      ...config,
    };

    const chartData: ChartData = {
      title: chartConfig.title,
      type: 'bar',
      config: chartConfig,
      series: [
        {
          name: yField,
          data: data.map((item) => ({
            x: item[xField],
            y: item[yField],
            label: item[xField],
          })),
          type: 'bar',
          color: '#10b981',
        },
      ],
      xAxis: {
        label: xField,
        type: this.inferAxisType(data, xField),
      },
      yAxis: {
        label: yField,
        type: 'value',
      },
    };

    return this.renderChart(chartData, { ...this.defaultOptions, ...options });
  }

  /**
   * Generate pie chart
   */
  generatePieChart(
    data: any[],
    labelField: string,
    valueField: string,
    config: Partial<ChartConfig> = {},
    options: Partial<VisualizationOptions> = {}
  ): string {
    const chartConfig: ChartConfig = {
      type: 'pie',
      title: `Distribution of ${labelField}`,
      width: 600,
      height: 400,
      theme: 'colorful',
      interactive: true,
      animated: true,
      ...config,
    };

    const chartData: ChartData = {
      title: chartConfig.title,
      type: 'pie',
      config: chartConfig,
      series: [
        {
          name: labelField,
          data: data.map((item) => ({
            x: item[labelField],
            y: item[valueField],
            label: item[labelField],
          })),
          type: 'pie',
        },
      ],
      xAxis: {
        label: '',
        type: 'category',
      },
      yAxis: {
        label: valueField,
        type: 'value',
      },
    };

    return this.renderChart(chartData, { ...this.defaultOptions, ...options });
  }

  /**
   * Generate scatter plot
   */
  generateScatterPlot(
    data: any[],
    xField: string,
    yField: string,
    config: Partial<ChartConfig> = {},
    options: Partial<VisualizationOptions> = {}
  ): string {
    const chartConfig: ChartConfig = {
      type: 'scatter',
      title: `${yField} vs ${xField}`,
      width: 800,
      height: 600,
      theme: 'light',
      interactive: true,
      animated: true,
      ...config,
    };

    const chartData: ChartData = {
      title: chartConfig.title,
      type: 'scatter',
      config: chartConfig,
      series: [
        {
          name: `${xField} vs ${yField}`,
          data: data.map((item) => ({
            x: item[xField],
            y: item[yField],
            label: `${item[xField]}, ${item[yField]}`,
          })),
          type: 'scatter',
          color: '#8b5cf6',
        },
      ],
      xAxis: {
        label: xField,
        type: 'value',
      },
      yAxis: {
        label: yField,
        type: 'value',
      },
    };

    return this.renderChart(chartData, { ...this.defaultOptions, ...options });
  }

  /**
   * Generate histogram
   */
  generateHistogram(
    data: number[],
    field: string,
    bins = 20,
    config: Partial<ChartConfig> = {},
    options: Partial<VisualizationOptions> = {}
  ): string {
    const chartConfig: ChartConfig = {
      type: 'histogram',
      title: `Distribution of ${field}`,
      width: 800,
      height: 400,
      theme: 'light',
      interactive: true,
      animated: true,
      ...config,
    };

    // Create histogram bins
    const min = Math.min(...data);
    const max = Math.max(...data);
    const binWidth = (max - min) / bins;
    const histogramData = [];

    for (let i = 0; i < bins; i++) {
      const binMin = min + i * binWidth;
      const binMax = binMin + binWidth;
      const count = data.filter(
        (value) => value >= binMin && value < binMax
      ).length;

      histogramData.push({
        x: `${binMin.toFixed(1)}-${binMax.toFixed(1)}`,
        y: count,
        label: `${binMin.toFixed(1)}-${binMax.toFixed(1)} (${count})`,
      });
    }

    const chartData: ChartData = {
      title: chartConfig.title,
      type: 'histogram',
      config: chartConfig,
      series: [
        {
          name: 'Frequency',
          data: histogramData,
          type: 'bar',
          color: '#f59e0b',
        },
      ],
      xAxis: {
        label: field,
        type: 'category',
      },
      yAxis: {
        label: 'Frequency',
        type: 'value',
      },
    };

    return this.renderChart(chartData, { ...this.defaultOptions, ...options });
  }

  /**
   * Generate box plot
   */
  generateBoxPlot(
    data: any[],
    valueField: string,
    categoryField: string,
    config: Partial<ChartConfig> = {},
    options: Partial<VisualizationOptions> = {}
  ): string {
    const chartConfig: ChartConfig = {
      type: 'box',
      title: `${valueField} by ${categoryField}`,
      width: 800,
      height: 400,
      theme: 'light',
      interactive: true,
      animated: true,
      ...config,
    };

    // Calculate box plot statistics for each category
    const categories = [...new Set(data.map((item) => item[categoryField]))];
    const boxPlotData = categories
      .map((category) => {
        const values = data
          .filter((item) => item[categoryField] === category)
          .map((item) => item[valueField])
          .filter((val) => typeof val === 'number' && !isNaN(val))
          .sort((a, b) => a - b);

        if (values.length === 0) return null;

        const q1 = this.percentile(values, 25);
        const median = this.percentile(values, 50);
        const q3 = this.percentile(values, 75);
        const iqr = q3 - q1;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const lowerFence = q1 - 1.5 * iqr;
        const upperFence = q3 + 1.5 * iqr;

        return {
          x: category,
          y: median,
          label: `${category}: Min=${min}, Q1=${q1}, Med=${median}, Q3=${q3}, Max=${max}`,
          min,
          q1,
          median,
          q3,
          max,
          lowerFence,
          upperFence,
          outliers: values.filter(
            (val) => val < lowerFence || val > upperFence
          ),
        };
      })
      .filter(
        (
          item
        ): item is {
          x: unknown;
          y: number;
          label: string;
          min: number;
          q1: number;
          median: number;
          q3: number;
          max: number;
          lowerFence: number;
          upperFence: number;
          outliers: number[];
        } => item !== null
      );

    const chartData: ChartData = {
      title: chartConfig.title,
      type: 'box',
      config: chartConfig,
      series: [
        {
          name: valueField,
          data: boxPlotData.map((item) => ({
            x: item.x,
            y: [item.min, item.q1, item.median, item.q3, item.max],
            label: item.label,
          })),
          type: 'box',
          color: '#ef4444',
        },
      ],
      xAxis: {
        label: categoryField,
        type: 'category',
      },
      yAxis: {
        label: valueField,
        type: 'value',
      },
    };

    return this.renderChart(chartData, { ...this.defaultOptions, ...options });
  }

  /**
   * Generate heatmap
   */
  generateHeatmap(
    data: Array<Record<string, unknown>>,
    xField: string,
    yField: string,
    valueField: string,
    config: Partial<ChartConfig> = {},
    options: Partial<VisualizationOptions> = {}
  ): string {
    const chartConfig: ChartConfig = {
      type: 'heatmap',
      title: `${valueField} Heatmap`,
      width: 800,
      height: 600,
      theme: 'colorful',
      interactive: true,
      animated: true,
      ...config,
    };

    // Flatten 2D data for heatmap
    const heatmapData: Array<{
      x: unknown;
      y: unknown;
      value: unknown;
      label: string;
    }> = [];
    data.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (key !== xField && key !== yField) {
          heatmapData.push({
            x: row[xField],
            y: row[yField],
            value: row[key],
            label: `${row[xField]} x ${row[yField]}: ${row[key]}`,
          });
        }
      });
    });

    const chartData: ChartData = {
      title: chartConfig.title,
      type: 'heatmap',
      config: chartConfig,
      series: [
        {
          name: valueField,
          data: heatmapData,
          type: 'heatmap',
        },
      ],
      xAxis: {
        label: xField,
        type: 'category',
      },
      yAxis: {
        label: yField,
        type: 'category',
      },
    };

    return this.renderChart(chartData, { ...this.defaultOptions, ...options });
  }

  /**
   * Generate area chart
   */
  generateAreaChart(
    data: any[],
    xField: string,
    yField: string,
    config: Partial<ChartConfig> = {},
    options: Partial<VisualizationOptions> = {}
  ): string {
    const chartConfig: ChartConfig = {
      type: 'area',
      title: `${yField} over ${xField}`,
      width: 800,
      height: 400,
      theme: 'light',
      interactive: true,
      animated: true,
      ...config,
    };

    const chartData: ChartData = {
      title: chartConfig.title,
      type: 'area',
      config: chartConfig,
      series: [
        {
          name: yField,
          data: data.map((item) => ({
            x: item[xField],
            y: item[yField],
            label: item[xField],
          })),
          type: 'area',
          color: '#06b6d4',
        },
      ],
      xAxis: {
        label: xField,
        type: this.inferAxisType(data, xField),
      },
      yAxis: {
        label: yField,
        type: 'value',
      },
    };

    return this.renderChart(chartData, { ...this.defaultOptions, ...options });
  }

  /**
   * Generate bubble chart
   */
  generateBubbleChart(
    data: any[],
    xField: string,
    yField: string,
    sizeField: string,
    config: Partial<ChartConfig> = {},
    options: Partial<VisualizationOptions> = {}
  ): string {
    const chartConfig: ChartConfig = {
      type: 'bubble',
      title: `${yField} vs ${xField} (Size: ${sizeField})`,
      width: 800,
      height: 600,
      theme: 'light',
      interactive: true,
      animated: true,
      ...config,
    };

    const chartData: ChartData = {
      title: chartConfig.title,
      type: 'bubble',
      config: chartConfig,
      series: [
        {
          name: `${xField} vs ${yField}`,
          data: data.map((item) => ({
            x: item[xField],
            y: item[yField],
            z: item[sizeField],
            label: `${item[xField]}, ${item[yField]}, Size: ${item[sizeField]}`,
          })),
          type: 'bubble',
          color: '#84cc16',
        },
      ],
      xAxis: {
        label: xField,
        type: 'value',
      },
      yAxis: {
        label: yField,
        type: 'value',
      },
    };

    return this.renderChart(chartData, { ...this.defaultOptions, ...options });
  }

  /**
   * Generate dashboard with multiple charts
   */
  generateDashboard(
    data: any[],
    charts: Array<{
      type:
        | 'line'
        | 'bar'
        | 'pie'
        | 'scatter'
        | 'histogram'
        | 'box'
        | 'heatmap'
        | 'area'
        | 'bubble';
      xField?: string;
      yField?: string;
      valueField?: string;
      sizeField?: string;
      title?: string;
      config?: Partial<ChartConfig>;
    }>,
    options: Partial<VisualizationOptions> = {}
  ): string {
    const dashboardCharts = charts.map((chartConfig, index) => {
      const { type, xField, yField, valueField, sizeField, title, config } =
        chartConfig;

      switch (type) {
        case 'line':
          return this.generateLineChart(
            data,
            xField || 'x',
            yField || 'y',
            { ...config, title: title || `Chart ${index + 1}` },
            options
          );
        case 'bar':
          return this.generateBarChart(
            data,
            xField || 'x',
            yField || 'y',
            { ...config, title: title || `Chart ${index + 1}` },
            options
          );
        case 'pie':
          return this.generatePieChart(
            data,
            xField || 'category',
            yField || 'value',
            { ...config, title: title || `Chart ${index + 1}` },
            options
          );
        case 'scatter':
          return this.generateScatterPlot(
            data,
            xField || 'x',
            yField || 'y',
            { ...config, title: title || `Chart ${index + 1}` },
            options
          );
        case 'histogram':
          return this.generateHistogram(
            data.map((item) => item[yField || 'value']),
            yField || 'value',
            20,
            { ...config, title: title || `Chart ${index + 1}` },
            options
          );
        case 'box':
          return this.generateBoxPlot(
            data,
            yField || 'value',
            xField || 'category',
            { ...config, title: title || `Chart ${index + 1}` },
            options
          );
        case 'heatmap':
          return this.generateHeatmap(
            data,
            xField || 'x',
            yField || 'y',
            valueField || 'value',
            { ...config, title: title || `Chart ${index + 1}` },
            options
          );
        case 'area':
          return this.generateAreaChart(
            data,
            xField || 'x',
            yField || 'y',
            { ...config, title: title || `Chart ${index + 1}` },
            options
          );
        case 'bubble':
          return this.generateBubbleChart(
            data,
            xField || 'x',
            yField || 'y',
            sizeField || 'size',
            { ...config, title: title || `Chart ${index + 1}` },
            options
          );
        default:
          return `<div>Unsupported chart type: ${type}</div>`;
      }
    });

    return `
      <div class="dashboard" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; padding: 20px;">
        ${dashboardCharts.join('\n')}
      </div>
    `;
  }

  /**
   * Render chart based on format
   */
  private renderChart(
    chartData: ChartData,
    options: VisualizationOptions
  ): string {
    switch (options.format) {
      case 'svg':
        return this.renderSVG(chartData, options);
      case 'html':
        return this.renderHTML(chartData, options);
      case 'json':
        return this.renderJSON(chartData);
      case 'canvas':
        return this.renderCanvas(chartData, options);
      case 'png':
      case 'pdf':
        return this.renderImage(chartData, options);
      default:
        return this.renderSVG(chartData, options);
    }
  }

  /**
   * Render SVG chart
   */
  private renderSVG(
    chartData: ChartData,
    options: VisualizationOptions
  ): string {
    const { width = 800, height = 400, theme = 'light' } = chartData.config;
    const colors = this.getThemeColors(theme);

    return `
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <style>
          .chart-title { font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; fill: ${
            colors.text
          }; }
          .axis { stroke: ${colors.grid}; stroke-width: 1; }
          .grid { stroke: ${
            colors.grid
          }; stroke-width: 0.5; stroke-dasharray: 2,2; }
          .data-line { stroke: ${colors.primary}; stroke-width: 2; fill: none; }
          .data-area { fill: ${colors.primary}; fill-opacity: 0.1; }
          .data-point { fill: ${
            colors.primary
          }; stroke: white; stroke-width: 2; }
          .axis-label { font-family: Arial, sans-serif; font-size: 12px; fill: ${
            colors.text
          }; }
          .legend { font-family: Arial, sans-serif; font-size: 12px; fill: ${
            colors.text
          }; }
        </style>
        
        <text x="${
          width / 2
        }" y="20" text-anchor="middle" class="chart-title">${
      chartData.title
    }</text>
        
        <!-- Grid lines -->
        ${this.generateGridLines(chartData, colors)}
        
        <!-- Data visualization -->
        ${this.generateSVGData(chartData, colors)}
        
        <!-- Axes -->
        ${this.generateSVGAxes(chartData, colors)}
        
        ${options.legend ? this.generateSVGLegend(chartData, colors) : ''}
      </svg>
    `;
  }

  /**
   * Render HTML chart
   */
  private renderHTML(
    chartData: ChartData,
    options: VisualizationOptions
  ): string {
    return `
      <div class="chart-container" style="width: ${
        chartData.config.width
      }px; height: ${chartData.config.height}px;">
        <h3>${chartData.title}</h3>
        <div class="chart-content">
          ${this.renderSVG(chartData, options)}
        </div>
        ${
          options.legend
            ? `<div class="chart-legend">${this.generateSVGLegend(
                chartData,
                this.getThemeColors(chartData.config.theme || 'light')
              )}</div>`
            : ''
        }
      </div>
    `;
  }

  /**
   * Render JSON data
   */
  private renderJSON(chartData: ChartData): string {
    return `<pre>${JSON.stringify(chartData, null, 2)}</pre>`;
  }

  /**
   * Render canvas chart
   */
  private renderCanvas(
    chartData: ChartData,
    options: VisualizationOptions
  ): string {
    return `
      <canvas id="chart-${Date.now()}" width="${
      chartData.config.width
    }" height="${chartData.config.height}"></canvas>
      <script>
        // Canvas rendering would be implemented here
        const chartData = ${JSON.stringify(chartData)};
        console.log('Canvas chart data:', chartData);
      </script>
    `;
  }

  /**
   * Render image placeholder
   */
  private renderImage(
    chartData: ChartData,
    options: VisualizationOptions
  ): string {
    return `
      <div class="chart-placeholder" style="width: ${
        chartData.config.width
      }px; height: ${
      chartData.config.height
    }px; display: flex; align-items: center; justify-content: center; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 4px;">
          <div style="text-align: center; color: #6b7280;">
          <div style="font-size: 48px;">Chart</div>
          <div>${chartData.title}</div>
          <div style="font-size: 12px;">${options.format.toUpperCase()} rendering</div>
        </div>
      </div>
    `;
  }

  /**
   * Generate grid lines for SVG
   */
  private generateGridLines(chartData: ChartData, colors: any): string {
    const width = chartData.config.width ?? 800;
    const height = chartData.config.height ?? 400;
    const gridLines = [];

    // Horizontal grid lines
    for (let i = 0; i <= 5; i++) {
      const y = 50 + (height - 100) * (i / 5);
      gridLines.push(
        `<line x1="50" y1="${y}" x2="${width - 50}" y2="${y}" class="axis" />`
      );
    }

    // Vertical grid lines
    for (let i = 0; i <= 5; i++) {
      const x = 50 + (width - 100) * (i / 5);
      gridLines.push(
        `<line x1="${x}" y1="50" x2="${x}" y2="${height - 50}" class="grid" />`
      );
    }

    return gridLines.join('\n');
  }

  /**
   * Generate SVG data visualization
   */
  private generateSVGData(chartData: ChartData, colors: any): string {
    const { series, config } = chartData;
    const width = config.width ?? 800;
    const height = config.height ?? 400;

    return series
      .map((seriesData) => {
        if (seriesData.type === 'line') {
          return this.generateSVGLine(seriesData, width, height, colors);
        } else if (seriesData.type === 'bar') {
          return this.generateSVGBars(seriesData, width, height, colors);
        } else if (seriesData.type === 'area') {
          return this.generateSVGA(seriesData, width, height, colors);
        }
        return '';
      })
      .join('\n');
  }

  /**
   * Generate SVG line
   */
  private generateSVGLine(
    series: DataSeries,
    width: number,
    height: number,
    colors: any
  ): string {
    const points = series.data
      .map((point) => {
        const normalizedX = Number(point.x) || 0;
        const normalizedY = Number(point.y) || 0;
        const x = 50 + (width - 100) * (normalizedX / 100);
        const y = height - 50 - (height - 100) * (normalizedY / 100);
        return `${x},${y}`;
      })
      .join(' ');

    return `<polyline points="${points}" class="data-line" />`;
  }

  /**
   * Generate SVG bars
   */
  private generateSVGBars(
    series: DataSeries,
    width: number,
    height: number,
    colors: any
  ): string {
    const barWidth = ((width - 100) / series.data.length) * 0.8;
    const barSpacing = ((width - 100) / series.data.length) * 0.2;

    return series.data
      .map((point, index) => {
        const x = 50 + index * (barWidth + barSpacing) + barSpacing / 2;
        const normalizedY = Number(point.y) || 0;
        const barHeight = (height - 100) * (normalizedY / 100);
        const y = height - 50 - barHeight;

        return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${colors.primary}" />`;
      })
      .join('\n');
  }

  /**
   * Generate SVG area
   */
  private generateSVGA(
    series: DataSeries,
    width: number,
    height: number,
    colors: any
  ): string {
    const points = series.data
      .map((point) => {
        const normalizedX = Number(point.x) || 0;
        const normalizedY = Number(point.y) || 0;
        const x = 50 + (width - 100) * (normalizedX / 100);
        const y = height - 50 - (height - 100) * (normalizedY / 100);
        return `${x},${y}`;
      })
      .join(' ');

    return `
      <polygon points="${points} ${width - 50},${
      height - 50
    }" class="data-area" />
      <polyline points="${points}" class="data-line" />
    `;
  }

  /**
   * Generate SVG axes
   */
  private generateSVGAxes(chartData: ChartData, colors: any): string {
    const width = chartData.config.width ?? 800;
    const height = chartData.config.height ?? 400;

    return `
      <line x1="50" y1="${height - 50}" x2="${width - 50}" y2="${
      height - 50
    }" class="axis" />
      <line x1="50" y1="50" x2="50" y2="${height - 50}" class="axis" />
      
      <text x="${width / 2}" y="${
      height - 30
    }" text-anchor="middle" class="axis-label">${chartData.xAxis.label}</text>
      <text x="30" y="${
        height / 2
      }" text-anchor="middle" transform="rotate(-90 30 ${
      height / 2
    })" class="axis-label">${chartData.yAxis.label}</text>
    `;
  }

  /**
   * Generate SVG legend
   */
  private generateSVGLegend(chartData: ChartData, colors: any): string {
    const width = chartData.config.width ?? 800;
    return `
      <g class="legend">
        ${chartData.series
          .map(
            (series, index) => `
          <rect x="${width - 150}" y="${
              20 + index * 25
            }" width="15" height="15" fill="${
              series.color || colors.primary
            }" />
          <text x="${width - 130}" y="${32 + index * 25}" class="legend">${
              series.name
            }</text>
        `
          )
          .join('')}
      </g>
    `;
  }

  /**
   * Get theme colors
   */
  private getThemeColors(theme: ChartConfig['theme'] = 'light'): {
    text: string;
    grid: string;
    primary: string;
    background: string;
  } {
    const themes = {
      light: {
        text: '#374151',
        grid: '#e5e7eb',
        primary: '#3b82f6',
        background: '#ffffff',
      },
      dark: {
        text: '#f3f4f6',
        grid: '#4b5563',
        primary: '#60a5fa',
        background: '#1f2937',
      },
      colorful: {
        text: '#374151',
        grid: '#e5e7eb',
        primary: '#8b5cf6',
        background: '#ffffff',
      },
    };

    return themes[theme ?? 'light'];
  }

  /**
   * Infer axis type from data
   */
  private inferAxisType(
    data: any[],
    field: string
  ): 'category' | 'value' | 'time' {
    const sample = data[0]?.[field];

    if (sample instanceof Date) {
      return 'time';
    } else if (typeof sample === 'string' && isNaN(Number(sample))) {
      return 'category';
    } else {
      return 'value';
    }
  }

  /**
   * Calculate percentile
   */
  private percentile(values: number[], p: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

/**
 * Global chart generator instance
 */
export const chartGenerator = new ChartGenerator();
