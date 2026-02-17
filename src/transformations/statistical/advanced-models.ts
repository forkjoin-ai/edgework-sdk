/**
 * Advanced statistical models for time series analysis and clustering
 * Extends basic statistical analysis with sophisticated algorithms
 */

import { StatisticalContext } from '../common-types';

export interface TimeSeriesAnalysis {
  trend: 'increasing' | 'decreasing' | 'stable' | 'volatile';
  seasonality: SeasonalityPattern[];
  forecast: ForecastResult[];
  decomposition: TimeSeriesDecomposition;
  stationarity: StationarityTest;
  anomalies: AnomalyDetection[];
}

export interface SeasonalityPattern {
  period: number; // in data points
  strength: number; // 0-1
  type: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  description: string;
}

export interface ForecastResult {
  timestamp: number;
  value: number;
  confidence: number;
  lowerBound: number;
  upperBound: number;
}

export interface TimeSeriesDecomposition {
  trend: number[];
  seasonal: number[];
  residual: number[];
  explainedVariance: number;
}

export interface StationarityTest {
  adfTest: ADFTestResult;
  kpssTest: KPSSTestResult;
  conclusion: 'stationary' | 'non-stationary' | 'inconclusive';
}

export interface ADFTestResult {
  statistic: number;
  pValue: number;
  criticalValues: Record<string, number>;
  conclusion: 'reject' | 'fail-to-reject';
}

export interface KPSSTestResult {
  statistic: number;
  pValue: number;
  criticalValues: Record<string, number>;
  conclusion: 'reject' | 'fail-to-reject';
}

export interface AnomalyDetection {
  index: number;
  value: number;
  expected: number;
  deviation: number;
  severity: 'low' | 'medium' | 'high';
  type: 'statistical' | 'seasonal' | 'trend';
}

export interface ClusteringAnalysis {
  algorithm: 'kmeans' | 'hierarchical' | 'dbscan' | 'gaussian-mixture';
  clusters: Cluster[];
  optimalClusters: number;
  silhouetteScore: number;
  clusterQuality: ClusterQuality;
}

export interface Cluster {
  id: number;
  size: number;
  centroid: number[];
  members: number[];
  characteristics: ClusterCharacteristics;
  silhouette: number;
}

export interface ClusterCharacteristics {
  density: number;
  compactness: number;
  separation: number;
  stability: number;
  dominantFeatures: string[];
}

export interface ClusterQuality {
  silhouetteScore: number;
  daviesBouldinIndex: number;
  calinskiHarabaszIndex: number;
  overallQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

export class AdvancedStatisticalModels {
  /**
   * Perform comprehensive time series analysis
   */
  static analyzeTimeSeries(
    data: number[],
    timestamps?: number[],
    options: {
      forecastHorizon?: number;
      confidenceLevel?: number;
      seasonalityPeriods?: number[];
    } = {}
  ): TimeSeriesAnalysis {
    const {
      forecastHorizon = 10,
      confidenceLevel = 0.95,
      seasonalityPeriods = [7, 30, 365],
    } = options;

    if (data.length < 10) {
      throw new Error('Time series analysis requires at least 10 data points');
    }

    // Detect trend
    const trend = this.detectTrend(data);

    // Detect seasonality
    const seasonality = this.detectSeasonality(data, seasonalityPeriods);

    // Decompose time series
    const decomposition = this.decomposeTimeSeries(data, seasonality);

    // Test for stationarity
    const stationarity = this.testStationarity(data);

    // Detect anomalies
    const anomalies = this.detectAnomalies(data, decomposition);

    // Generate forecast
    const forecast = this.generateForecast(
      data,
      decomposition,
      forecastHorizon,
      confidenceLevel
    );

    return {
      trend,
      seasonality,
      forecast,
      decomposition,
      stationarity,
      anomalies,
    };
  }

  /**
   * Detect trend in time series data
   */
  private static detectTrend(
    data: number[]
  ): 'increasing' | 'decreasing' | 'stable' | 'volatile' {
    const n = data.length;
    const x = Array.from({ length: n }, (_, i) => i);

    // Calculate linear regression
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = data.reduce((a, b) => a + b, 0) / n;

    const numerator = x.reduce(
      (sum, xi, i) => sum + (xi - meanX) * (data[i] - meanY),
      0
    );
    const denominator = x.reduce((sum, xi) => sum + Math.pow(xi - meanX, 2), 0);

    const slope = numerator / denominator;
    const correlation = this.calculateCorrelation(x, data);

    // Calculate volatility (standard deviation of changes)
    const changes = data.slice(1).map((val, i) => val - data[i]);
    const volatility = Math.sqrt(
      changes.reduce((sum, change) => sum + change * change, 0) / changes.length
    );
    const avgValue = data.reduce((sum, val) => sum + val, 0) / n;
    const relativeVolatility = volatility / avgValue;

    // Determine trend
    if (Math.abs(slope) < (0.01 * avgValue) / n) {
      return relativeVolatility > 0.1 ? 'volatile' : 'stable';
    } else if (slope > 0) {
      return correlation > 0.3 ? 'increasing' : 'volatile';
    } else {
      return correlation < -0.3 ? 'decreasing' : 'volatile';
    }
  }

  /**
   * Detect seasonal patterns
   */
  private static detectSeasonality(
    data: number[],
    periods: number[]
  ): SeasonalityPattern[] {
    const patterns: SeasonalityPattern[] = [];

    for (const period of periods) {
      if (data.length < period * 2) continue;

      const strength = this.calculateSeasonalStrength(data, period);

      if (strength > 0.3) {
        let type: SeasonalityPattern['type'] = 'custom';
        if (period === 7) type = 'weekly';
        else if (period === 30) type = 'monthly';
        else if (period === 365) type = 'yearly';
        else if (period === 24) type = 'daily';

        patterns.push({
          period,
          strength,
          type,
          description: `${type} seasonality with ${Math.round(
            strength * 100
          )}% strength`,
        });
      }
    }

    return patterns.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Calculate seasonal strength for a given period
   */
  private static calculateSeasonalStrength(
    data: number[],
    period: number
  ): number {
    const n = data.length;
    const cycles = Math.floor(n / period);

    if (cycles < 2) return 0;

    // Calculate average pattern across cycles
    const pattern = new Array(period).fill(0);
    for (let i = 0; i < cycles * period; i++) {
      pattern[i % period] += data[i];
    }

    // Normalize pattern
    for (let i = 0; i < period; i++) {
      pattern[i] /= cycles;
    }

    // Calculate pattern strength (variance explained by pattern)
    const overallMean = data.reduce((sum, val) => sum + val, 0) / n;
    const totalVariance =
      data.reduce((sum, val) => sum + Math.pow(val - overallMean, 2), 0) / n;

    let patternVariance = 0;
    for (let i = 0; i < cycles * period; i++) {
      const expected = pattern[i % period];
      patternVariance += Math.pow(data[i] - expected, 2);
    }
    patternVariance /= cycles * period;

    const strength = Math.max(0, 1 - patternVariance / totalVariance);
    return Math.min(strength, 1);
  }

  /**
   * Decompose time series into trend, seasonal, and residual components
   */
  private static decomposeTimeSeries(
    data: number[],
    seasonality: SeasonalityPattern[]
  ): TimeSeriesDecomposition {
    const n = data.length;

    // Simple moving average for trend
    const trendWindow = Math.min(7, Math.floor(n / 4));
    const trend: number[] = [];

    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - Math.floor(trendWindow / 2));
      const end = Math.min(n, i + Math.ceil(trendWindow / 2));
      const window = data.slice(start, end);
      trend.push(window.reduce((sum, val) => sum + val, 0) / window.length);
    }

    // Extract seasonal component
    const seasonal = new Array(n).fill(0);
    if (seasonality.length > 0) {
      const primarySeasonality = seasonality[0];
      const period = primarySeasonality.period;

      // Calculate seasonal pattern
      const pattern = new Array(period).fill(0);
      const counts = new Array(period).fill(0);

      for (let i = 0; i < n; i++) {
        const detrended = data[i] - trend[i];
        pattern[i % period] += detrended;
        counts[i % period]++;
      }

      // Normalize pattern
      for (let i = 0; i < period; i++) {
        pattern[i] /= counts[i];
      }

      // Apply seasonal pattern
      for (let i = 0; i < n; i++) {
        seasonal[i] = pattern[i % period];
      }
    }

    // Calculate residual component
    const residual = data.map((val, i) => val - trend[i] - seasonal[i]);

    // Calculate explained variance
    const totalVariance = this.calculateVariance(data);
    const residualVariance = this.calculateVariance(residual);
    const explainedVariance = Math.max(0, 1 - residualVariance / totalVariance);

    return {
      trend,
      seasonal,
      residual,
      explainedVariance,
    };
  }

  /**
   * Test for stationarity using simplified ADF and KPSS tests
   */
  private static testStationarity(data: number[]): StationarityTest {
    // Simplified ADF test (Augmented Dickey-Fuller)
    const adfResult = this.performADFTest(data);

    // Simplified KPSS test
    const kpssResult = this.performKPSSTest(data);

    // Determine conclusion
    let conclusion: StationarityTest['conclusion'];
    if (
      adfResult.conclusion === 'reject' &&
      kpssResult.conclusion === 'fail-to-reject'
    ) {
      conclusion = 'stationary';
    } else if (
      adfResult.conclusion === 'fail-to-reject' &&
      kpssResult.conclusion === 'reject'
    ) {
      conclusion = 'non-stationary';
    } else {
      conclusion = 'inconclusive';
    }

    return {
      adfTest: adfResult,
      kpssTest: kpssResult,
      conclusion,
    };
  }

  /**
   * Perform simplified Augmented Dickey-Fuller test
   */
  private static performADFTest(data: number[]): ADFTestResult {
    // Simplified implementation - in practice would use proper statistical library
    const n = data.length;

    // Calculate first differences
    const differences = data.slice(1).map((val, i) => val - data[i]);

    // Simple regression of differences on lagged values
    const y = differences;
    const x = data.slice(0, -1);

    const regression = this.simpleLinearRegression(x, y);

    // Test statistic (simplified)
    const statistic = regression.slope / regression.standardError;

    // Critical values (simplified for common significance levels)
    const criticalValues = {
      '1%': -3.43,
      '5%': -2.86,
      '10%': -2.57,
    };

    const conclusion =
      statistic < criticalValues['5%'] ? 'reject' : 'fail-to-reject';
    const pValue = this.estimatePValue(statistic);

    return {
      statistic,
      pValue,
      criticalValues,
      conclusion,
    };
  }

  /**
   * Perform simplified KPSS test
   */
  private static performKPSSTest(data: number[]): KPSSTestResult {
    // Simplified KPSS implementation
    const n = data.length;
    const mean = data.reduce((sum, val) => sum + val, 0) / n;

    // Calculate partial sums of deviations from mean
    const partialSums: number[] = [];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += data[i] - mean;
      partialSums.push(sum);
    }

    // Calculate test statistic
    const numerator = partialSums.reduce((sum, val) => sum + val * val, 0);
    const denominator = n * n * this.calculateVariance(data);
    const statistic = numerator / denominator;

    // Critical values
    const criticalValues = {
      '1%': 0.739,
      '5%': 0.463,
      '10%': 0.347,
    };

    const conclusion =
      statistic > criticalValues['5%'] ? 'reject' : 'fail-to-reject';
    const pValue = this.estimatePValueKPSS(statistic);

    return {
      statistic,
      pValue,
      criticalValues,
      conclusion,
    };
  }

  /**
   * Detect anomalies in time series
   */
  private static detectAnomalies(
    data: number[],
    decomposition: TimeSeriesDecomposition
  ): AnomalyDetection[] {
    const anomalies: AnomalyDetection[] = [];
    const { residual } = decomposition;

    // Calculate residual statistics
    const residualMean =
      residual.reduce((sum, val) => sum + val, 0) / residual.length;
    const residualStd = Math.sqrt(
      residual.reduce((sum, val) => sum + Math.pow(val - residualMean, 2), 0) /
        residual.length
    );

    // Detect statistical anomalies (residuals beyond 3 standard deviations)
    for (let i = 0; i < data.length; i++) {
      const deviation = Math.abs(residual[i] - residualMean);
      const threshold = 3 * residualStd;

      if (deviation > threshold) {
        const severity =
          deviation > 4 * residualStd
            ? 'high'
            : deviation > 3.5 * residualStd
            ? 'medium'
            : 'low';

        anomalies.push({
          index: i,
          value: data[i],
          expected: data[i] - residual[i],
          deviation,
          severity,
          type: 'statistical',
        });
      }
    }

    return anomalies;
  }

  /**
   * Generate forecast using decomposition
   */
  private static generateForecast(
    data: number[],
    decomposition: TimeSeriesDecomposition,
    horizon: number,
    confidenceLevel: number
  ): ForecastResult[] {
    const { trend, seasonal } = decomposition;
    const n = data.length;
    const forecast: ForecastResult[] = [];

    // Extract last trend value and trend slope
    const lastTrend = trend[trend.length - 1];
    const trendSlope =
      trend.length > 1 ? trend[trend.length - 1] - trend[trend.length - 2] : 0;

    // Calculate residual standard error for confidence intervals
    const residualStd = Math.sqrt(
      decomposition.residual.reduce((sum, val) => sum + val * val, 0) /
        decomposition.residual.length
    );

    // Z-score for confidence level
    const zScore = this.getZScore(confidenceLevel);

    for (let i = 0; i < horizon; i++) {
      const timestamp = Date.now() + (i + 1) * 24 * 60 * 60 * 1000; // Daily steps

      // Project trend
      const trendValue = lastTrend + trendSlope * (i + 1);

      // Add seasonal component if available
      const seasonalValue =
        seasonal.length > 0 ? seasonal[i % seasonal.length] : 0;

      // Point forecast
      const value = trendValue + seasonalValue;

      // Confidence intervals
      const margin = zScore * residualStd * Math.sqrt(i + 1);
      const lowerBound = value - margin;
      const upperBound = value + margin;

      // Confidence decreases with horizon
      const confidence = confidenceLevel * Math.exp(-i / horizon);

      forecast.push({
        timestamp,
        value,
        confidence,
        lowerBound,
        upperBound,
      });
    }

    return forecast;
  }

  /**
   * Perform clustering analysis on multidimensional data
   */
  static performClustering(
    data: number[][],
    algorithm: ClusteringAnalysis['algorithm'] = 'kmeans',
    options: {
      maxClusters?: number;
      distanceMetric?: 'euclidean' | 'manhattan' | 'cosine';
    } = {}
  ): ClusteringAnalysis {
    const { maxClusters = 10, distanceMetric = 'euclidean' } = options;

    if (data.length < 2) {
      throw new Error('Clustering requires at least 2 data points');
    }

    let clusters: Cluster[];
    let optimalClusters = 2;
    let silhouetteScore = 0;

    switch (algorithm) {
      case 'kmeans':
        ({ clusters, optimalClusters, silhouetteScore } = this.performKMeans(
          data,
          maxClusters
        ));
        break;
      case 'hierarchical':
        ({ clusters, optimalClusters, silhouetteScore } =
          this.performHierarchical(data, maxClusters));
        break;
      case 'dbscan':
        ({ clusters, optimalClusters, silhouetteScore } =
          this.performDBSCAN(data));
        break;
      case 'gaussian-mixture':
        ({ clusters, optimalClusters, silhouetteScore } =
          this.performGaussianMixture(data, maxClusters));
        break;
      default:
        throw new Error(`Unsupported clustering algorithm: ${algorithm}`);
    }

    const clusterQuality = this.calculateClusterQuality(clusters, data);

    return {
      algorithm,
      clusters,
      optimalClusters,
      silhouetteScore,
      clusterQuality,
    };
  }

  /**
   * Perform K-means clustering
   */
  private static performKMeans(
    data: number[][],
    maxClusters: number
  ): { clusters: Cluster[]; optimalClusters: number; silhouetteScore: number } {
    let bestClusters: Cluster[] = [];
    let bestScore = -1;
    let optimalK = 2;

    // Test different numbers of clusters
    for (let k = 2; k <= Math.min(maxClusters, data.length - 1); k++) {
      const clusters = this.kMeansIteration(data, k);
      const score = this.calculateSilhouetteScore(clusters, data);

      if (score > bestScore) {
        bestScore = score;
        bestClusters = clusters;
        optimalK = k;
      }
    }

    return {
      clusters: bestClusters,
      optimalClusters: optimalK,
      silhouetteScore: bestScore,
    };
  }

  /**
   * Single K-means iteration
   */
  private static kMeansIteration(data: number[][], k: number): Cluster[] {
    const dimensions = data[0].length;

    // Initialize centroids randomly from data points
    const centroidIndices = this.selectRandomIndices(data.length, k);
    let centroids = centroidIndices.map((i) => [...data[i]]);

    let clusters: Cluster[] = [];
    let converged = false;
    let iterations = 0;
    const maxIterations = 100;

    while (!converged && iterations < maxIterations) {
      // Assign points to nearest centroid
      const assignments = data.map((point) =>
        this.findNearestCentroid(point, centroids)
      );

      // Create new clusters
      const newClusters: Cluster[] = [];
      for (let i = 0; i < k; i++) {
        const members = assignments
          .map((assignment, index) => (assignment === i ? index : -1))
          .filter((index) => index !== -1);

        if (members.length > 0) {
          const centroid = this.calculateCentroid(data, members);
          const characteristics = this.calculateClusterCharacteristics(
            data,
            members,
            centroid
          );
          const silhouette = this.calculateClusterSilhouette(
            data,
            members,
            i,
            assignments
          );

          newClusters.push({
            id: i,
            size: members.length,
            centroid,
            members,
            characteristics,
            silhouette,
          });
        }
      }

      // Check for convergence
      converged = this.checkConvergence(
        centroids,
        newClusters.map((c) => c.centroid)
      );
      centroids = newClusters.map((c) => c.centroid);
      clusters = newClusters;
      iterations++;
    }

    return clusters;
  }

  /**
   * Find nearest centroid for a point
   */
  private static findNearestCentroid(
    point: number[],
    centroids: number[][]
  ): number {
    let minDistance = Infinity;
    let nearestIndex = 0;

    centroids.forEach((centroid, index) => {
      const distance = this.euclideanDistance(point, centroid);
      if (distance < minDistance) {
        minDistance = distance;
        nearestIndex = index;
      }
    });

    return nearestIndex;
  }

  /**
   * Calculate Euclidean distance
   */
  private static euclideanDistance(a: number[], b: number[]): number {
    return Math.sqrt(
      a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0)
    );
  }

  /**
   * Calculate Manhattan distance
   */
  private static manhattanDistance(a: number[], b: number[]): number {
    return a.reduce((sum, val, i) => sum + Math.abs(val - b[i]), 0);
  }

  /**
   * Calculate cosine distance
   */
  private static cosineDistance(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return 1 - dotProduct / (normA * normB);
  }

  /**
   * Select random indices without replacement
   */
  private static selectRandomIndices(n: number, k: number): number[] {
    const indices = Array.from({ length: n }, (_, i) => i);
    const selected: number[] = [];

    for (let i = 0; i < k && indices.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * indices.length);
      selected.push(indices[randomIndex]);
      indices.splice(randomIndex, 1);
    }

    return selected;
  }

  /**
   * Calculate centroid of cluster members
   */
  private static calculateCentroid(
    data: number[][],
    members: number[]
  ): number[] {
    const dimensions = data[0].length;
    const centroid = new Array(dimensions).fill(0);

    members.forEach((memberIndex) => {
      const point = data[memberIndex];
      point.forEach((value, dim) => {
        centroid[dim] += value;
      });
    });

    return centroid.map((val) => val / members.length);
  }

  /**
   * Calculate cluster characteristics
   */
  private static calculateClusterCharacteristics(
    data: number[][],
    members: number[],
    centroid: number[]
  ): ClusterCharacteristics {
    if (members.length === 0) {
      return {
        density: 0,
        compactness: 0,
        separation: 0,
        stability: 0,
        dominantFeatures: [],
      };
    }

    // Calculate density (average distance to centroid)
    const distances = members.map((memberIndex) =>
      this.euclideanDistance(data[memberIndex], centroid)
    );
    const avgDistance =
      distances.reduce((sum, dist) => sum + dist, 0) / distances.length;
    const density = 1 / (1 + avgDistance);

    // Calculate compactness (inverse of variance)
    const variance =
      distances.reduce(
        (sum, dist) => sum + Math.pow(dist - avgDistance, 2),
        0
      ) / distances.length;
    const compactness = 1 / (1 + variance);

    // Calculate separation (minimum distance to other clusters - simplified)
    const separation = avgDistance; // Simplified - would need other clusters for true separation

    // Calculate stability (simplified as density * compactness)
    const stability = density * compactness;

    // Identify dominant features (features with low variance within cluster)
    const dimensions = data[0].length;
    const featureVariances = new Array(dimensions).fill(0);

    members.forEach((memberIndex) => {
      const point = data[memberIndex];
      point.forEach((value, dim) => {
        const diff = value - centroid[dim];
        featureVariances[dim] += diff * diff;
      });
    });

    featureVariances.forEach((variance, i) => {
      featureVariances[i] = variance / members.length;
    });

    const dominantFeatures = featureVariances
      .map((variance, index) => ({ index, variance }))
      .sort((a, b) => a.variance - b.variance)
      .slice(0, Math.min(3, dimensions))
      .map((item) => `feature_${item.index}`);

    return {
      density,
      compactness,
      separation,
      stability,
      dominantFeatures,
    };
  }

  /**
   * Calculate silhouette score for clustering
   */
  private static calculateSilhouetteScore(
    clusters: Cluster[],
    data: number[][]
  ): number {
    if (clusters.length <= 1) return 0;

    let totalSilhouette = 0;
    let totalPoints = 0;

    clusters.forEach((cluster) => {
      cluster.members.forEach((pointIndex) => {
        const point = data[pointIndex];

        // Calculate a(i): average distance to points in same cluster
        const sameClusterDistances = cluster.members
          .filter((otherIndex) => otherIndex !== pointIndex)
          .map((otherIndex) => this.euclideanDistance(point, data[otherIndex]));

        const a =
          sameClusterDistances.length > 0
            ? sameClusterDistances.reduce((sum, dist) => sum + dist, 0) /
              sameClusterDistances.length
            : 0;

        // Calculate b(i): minimum average distance to points in other clusters
        let minB = Infinity;
        clusters.forEach((otherCluster) => {
          if (otherCluster.id === cluster.id) return;

          const otherClusterDistances = otherCluster.members.map((otherIndex) =>
            this.euclideanDistance(point, data[otherIndex])
          );

          if (otherClusterDistances.length > 0) {
            const avgDistance =
              otherClusterDistances.reduce((sum, dist) => sum + dist, 0) /
              otherClusterDistances.length;
            minB = Math.min(minB, avgDistance);
          }
        });

        // Calculate silhouette for this point
        const silhouette =
          minB === Infinity ? 0 : (minB - a) / Math.max(a, minB);
        totalSilhouette += silhouette;
        totalPoints++;
      });
    });

    return totalPoints > 0 ? totalSilhouette / totalPoints : 0;
  }

  /**
   * Calculate silhouette for individual cluster
   */
  private static calculateClusterSilhouette(
    data: number[][],
    members: number[],
    clusterId: number,
    assignments: number[]
  ): number {
    if (members.length <= 1) return 0;

    let totalSilhouette = 0;

    members.forEach((pointIndex) => {
      const point = data[pointIndex];

      // Same cluster distances
      const sameClusterIndices = members.filter((i) => i !== pointIndex);
      const a =
        sameClusterIndices.length > 0
          ? sameClusterIndices.reduce(
              (sum, i) => sum + this.euclideanDistance(point, data[i]),
              0
            ) / sameClusterIndices.length
          : 0;

      // Nearest other cluster
      let minB = Infinity;
      const otherClusterIds = [...new Set(assignments)].filter(
        (id) => id !== clusterId
      );

      otherClusterIds.forEach((otherId) => {
        const otherIndices = assignments
          .map((assignment, index) => (assignment === otherId ? index : -1))
          .filter((i) => i !== -1);

        if (otherIndices.length > 0) {
          const avgDistance =
            otherIndices.reduce(
              (sum, i) => sum + this.euclideanDistance(point, data[i]),
              0
            ) / otherIndices.length;
          minB = Math.min(minB, avgDistance);
        }
      });

      const silhouette = minB === Infinity ? 0 : (minB - a) / Math.max(a, minB);
      totalSilhouette += silhouette;
    });

    return totalSilhouette / members.length;
  }

  /**
   * Check convergence of centroids
   */
  private static checkConvergence(
    oldCentroids: number[][],
    newCentroids: number[][]
  ): boolean {
    const threshold = 1e-6;

    for (let i = 0; i < oldCentroids.length; i++) {
      const distance = this.euclideanDistance(oldCentroids[i], newCentroids[i]);
      if (distance > threshold) {
        return false;
      }
    }

    return true;
  }

  /**
   * Placeholder for hierarchical clustering
   */
  private static performHierarchical(
    data: number[][],
    maxClusters: number
  ): { clusters: Cluster[]; optimalClusters: number; silhouetteScore: number } {
    // Simplified implementation - would use proper hierarchical clustering
    return this.performKMeans(data, maxClusters);
  }

  /**
   * Placeholder for DBSCAN clustering
   */
  private static performDBSCAN(data: number[][]): {
    clusters: Cluster[];
    optimalClusters: number;
    silhouetteScore: number;
  } {
    // Simplified implementation - would use proper DBSCAN
    return this.performKMeans(data, Math.min(5, data.length - 1));
  }

  /**
   * Placeholder for Gaussian Mixture clustering
   */
  private static performGaussianMixture(
    data: number[][],
    maxClusters: number
  ): { clusters: Cluster[]; optimalClusters: number; silhouetteScore: number } {
    // Simplified implementation - would use proper GMM
    return this.performKMeans(data, maxClusters);
  }

  /**
   * Calculate cluster quality metrics
   */
  private static calculateClusterQuality(
    clusters: Cluster[],
    data: number[][]
  ): ClusterQuality {
    const silhouetteScore = this.calculateSilhouetteScore(clusters, data);

    // Simplified Davies-Bouldin index
    let daviesBouldinIndex = 0;
    clusters.forEach((cluster, i) => {
      let maxRatio = 0;
      clusters.forEach((otherCluster, j) => {
        if (i === j) return;

        const distance = this.euclideanDistance(
          cluster.centroid,
          otherCluster.centroid
        );
        const ratio =
          (cluster.characteristics.compactness +
            otherCluster.characteristics.compactness) /
          distance;
        maxRatio = Math.max(maxRatio, ratio);
      });
      daviesBouldinIndex += maxRatio;
    });
    daviesBouldinIndex /= clusters.length;

    // Simplified Calinski-Harabasz index
    const overallCentroid = this.calculateCentroid(
      data,
      data.map((_, i) => i)
    );
    let betweenClusterVariance = 0;
    clusters.forEach((cluster) => {
      const distance = this.euclideanDistance(
        cluster.centroid,
        overallCentroid
      );
      betweenClusterVariance += cluster.size * distance * distance;
    });

    let withinClusterVariance = 0;
    clusters.forEach((cluster) => {
      withinClusterVariance += cluster.members.reduce((sum, memberIndex) => {
        const distance = this.euclideanDistance(
          data[memberIndex],
          cluster.centroid
        );
        return sum + distance * distance;
      }, 0);
    });

    const calinskiHarabaszIndex =
      ((betweenClusterVariance / withinClusterVariance) *
        (data.length - clusters.length)) /
      (clusters.length - 1);

    // Determine overall quality
    let overallQuality: ClusterQuality['overallQuality'];
    if (silhouetteScore > 0.7 && daviesBouldinIndex < 0.5) {
      overallQuality = 'excellent';
    } else if (silhouetteScore > 0.5 && daviesBouldinIndex < 1.0) {
      overallQuality = 'good';
    } else if (silhouetteScore > 0.3 && daviesBouldinIndex < 1.5) {
      overallQuality = 'fair';
    } else {
      overallQuality = 'poor';
    }

    return {
      silhouetteScore,
      daviesBouldinIndex,
      calinskiHarabaszIndex,
      overallQuality,
    };
  }

  /**
   * Utility methods
   */
  private static calculateCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    const meanX = x.reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.reduce((sum, val) => sum + val, 0) / n;

    const numerator = x.reduce(
      (sum, xi, i) => sum + (xi - meanX) * (y[i] - meanY),
      0
    );
    const denominatorX = x.reduce(
      (sum, xi) => sum + Math.pow(xi - meanX, 2),
      0
    );
    const denominatorY = y.reduce(
      (sum, yi) => sum + Math.pow(yi - meanY, 2),
      0
    );

    return numerator / Math.sqrt(denominatorX * denominatorY);
  }

  private static calculateVariance(data: number[]): number {
    const mean = data.reduce((sum, val) => sum + val, 0) / data.length;
    return (
      data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length
    );
  }

  private static simpleLinearRegression(
    x: number[],
    y: number[]
  ): { slope: number; intercept: number; standardError: number } {
    const n = x.length;
    const meanX = x.reduce((sum, val) => sum + val, 0) / n;
    const meanY = y.reduce((sum, val) => sum + val, 0) / n;

    const numerator = x.reduce(
      (sum, xi, i) => sum + (xi - meanX) * (y[i] - meanY),
      0
    );
    const denominator = x.reduce((sum, xi) => sum + Math.pow(xi - meanX, 2), 0);

    const slope = numerator / denominator;
    const intercept = meanY - slope * meanX;

    // Calculate standard error (simplified)
    const residuals = y.map((yi, i) => yi - (slope * x[i] + intercept));
    const residualVariance =
      residuals.reduce((sum, residual) => sum + residual * residual, 0) /
      (n - 2);
    const standardError = Math.sqrt(residualVariance / denominator);

    return { slope, intercept, standardError };
  }

  private static estimatePValue(statistic: number): number {
    // Simplified p-value estimation
    if (statistic < -4) return 0.001;
    if (statistic < -3) return 0.01;
    if (statistic < -2) return 0.05;
    if (statistic < -1.5) return 0.1;
    return 0.2;
  }

  private static estimatePValueKPSS(statistic: number): number {
    // Simplified p-value estimation for KPSS
    if (statistic > 0.739) return 0.01;
    if (statistic > 0.463) return 0.05;
    if (statistic > 0.347) return 0.1;
    return 0.2;
  }

  private static getZScore(confidenceLevel: number): number {
    // Simplified z-score lookup
    if (confidenceLevel >= 0.99) return 2.576;
    if (confidenceLevel >= 0.95) return 1.96;
    if (confidenceLevel >= 0.9) return 1.645;
    return 1.282;
  }
}
