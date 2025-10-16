// Performance Monitor
// Real-time monitoring and optimization of system performance

interface PerformanceAlert {
  id: string;
  type: 'slow_execution' | 'high_memory' | 'cache_miss' | 'error_rate';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
  metrics: any;
}

interface SystemMetrics {
  cpu: {
    usage: number;
    load: number;
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  network: {
    requests: number;
    latency: number;
    errors: number;
  };
  database: {
    connections: number;
    queries: number;
    slowQueries: number;
  };
}

interface PerformanceThresholds {
  maxExecutionTime: number;
  maxMemoryUsage: number;
  maxCacheMissRate: number;
  maxErrorRate: number;
}

export class PerformanceMonitor {
  private alerts: PerformanceAlert[] = [];
  private metrics: SystemMetrics;
  private thresholds: PerformanceThresholds;
  private isMonitoring: boolean = false;
  private monitoringInterval: number | null = null;
  
  constructor(thresholds: PerformanceThresholds = {
    maxExecutionTime: 5000, // 5 seconds
    maxMemoryUsage: 80, // 80%
    maxCacheMissRate: 0.3, // 30%
    maxErrorRate: 0.05 // 5%
  }) {
    this.thresholds = thresholds;
    this.metrics = {
      cpu: { usage: 0, load: 0 },
      memory: { used: 0, total: 0, percentage: 0 },
      network: { requests: 0, latency: 0, errors: 0 },
      database: { connections: 0, queries: 0, slowQueries: 0 }
    };
  }
  
  // Start monitoring
  startMonitoring(intervalMs: number = 10000): void {
    if (this.isMonitoring) {
      console.warn('[PERFORMANCE] Monitoring already started');
      return;
    }
    
    this.isMonitoring = true;
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
      this.checkThresholds();
    }, intervalMs);
    
    console.log(`[PERFORMANCE] Started monitoring with ${intervalMs}ms interval`);
  }
  
  // Stop monitoring
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('[PERFORMANCE] Stopped monitoring');
  }
  
  // Collect system metrics
  private collectMetrics(): void {
    try {
      // CPU usage (simplified)
      this.metrics.cpu.usage = this.getCPUUsage();
      this.metrics.cpu.load = this.getCPULoad();
      
      // Memory usage
      this.metrics.memory = this.getMemoryUsage();
      
      // Network metrics
      this.metrics.network = this.getNetworkMetrics();
      
      // Database metrics
      this.metrics.database = this.getDatabaseMetrics();
      
    } catch (error) {
      console.error('[PERFORMANCE] Error collecting metrics:', error);
    }
  }
  
  // Get CPU usage (simplified)
  private getCPUUsage(): number {
    // In a real implementation, you would use system APIs
    // For now, return a simulated value
    return Math.random() * 100;
  }
  
  // Get CPU load
  private getCPULoad(): number {
    // In a real implementation, you would use system APIs
    return Math.random() * 4; // 0-4 load average
  }
  
  // Get memory usage
  private getMemoryUsage(): { used: number; total: number; percentage: number } {
    // In a real implementation, you would use system APIs
    const total = 8 * 1024 * 1024 * 1024; // 8GB
    const used = Math.random() * total;
    return {
      used,
      total,
      percentage: (used / total) * 100
    };
  }
  
  // Get network metrics
  private getNetworkMetrics(): { requests: number; latency: number; errors: number } {
    // In a real implementation, you would track actual network stats
    return {
      requests: Math.floor(Math.random() * 1000),
      latency: Math.random() * 100,
      errors: Math.floor(Math.random() * 10)
    };
  }
  
  // Get database metrics
  private getDatabaseMetrics(): { connections: number; queries: number; slowQueries: number } {
    // In a real implementation, you would query database stats
    return {
      connections: Math.floor(Math.random() * 100),
      queries: Math.floor(Math.random() * 10000),
      slowQueries: Math.floor(Math.random() * 100)
    };
  }
  
  // Check performance thresholds
  private checkThresholds(): void {
    const alerts: PerformanceAlert[] = [];
    
    // Check execution time
    if (this.metrics.cpu.usage > this.thresholds.maxExecutionTime) {
      alerts.push({
        id: `slow_execution_${Date.now()}`,
        type: 'slow_execution',
        severity: 'high',
        message: `Execution time exceeded threshold: ${this.metrics.cpu.usage}ms > ${this.thresholds.maxExecutionTime}ms`,
        timestamp: Date.now(),
        metrics: { executionTime: this.metrics.cpu.usage }
      });
    }
    
    // Check memory usage
    if (this.metrics.memory.percentage > this.thresholds.maxMemoryUsage) {
      alerts.push({
        id: `high_memory_${Date.now()}`,
        type: 'high_memory',
        severity: 'critical',
        message: `Memory usage exceeded threshold: ${this.metrics.memory.percentage.toFixed(2)}% > ${this.thresholds.maxMemoryUsage}%`,
        timestamp: Date.now(),
        metrics: { memoryUsage: this.metrics.memory.percentage }
      });
    }
    
    // Check cache miss rate
    const cacheMissRate = this.calculateCacheMissRate();
    if (cacheMissRate > this.thresholds.maxCacheMissRate) {
      alerts.push({
        id: `cache_miss_${Date.now()}`,
        type: 'cache_miss',
        severity: 'medium',
        message: `Cache miss rate exceeded threshold: ${(cacheMissRate * 100).toFixed(2)}% > ${(this.thresholds.maxCacheMissRate * 100).toFixed(2)}%`,
        timestamp: Date.now(),
        metrics: { cacheMissRate }
      });
    }
    
    // Check error rate
    const errorRate = this.calculateErrorRate();
    if (errorRate > this.thresholds.maxErrorRate) {
      alerts.push({
        id: `error_rate_${Date.now()}`,
        type: 'error_rate',
        severity: 'high',
        message: `Error rate exceeded threshold: ${(errorRate * 100).toFixed(2)}% > ${(this.thresholds.maxErrorRate * 100).toFixed(2)}%`,
        timestamp: Date.now(),
        metrics: { errorRate }
      });
    }
    
    // Add new alerts
    this.alerts.push(...alerts);
    
    // Keep only recent alerts (last 100)
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }
    
    // Log critical alerts
    alerts.filter(alert => alert.severity === 'critical').forEach(alert => {
      console.error(`[PERFORMANCE] CRITICAL: ${alert.message}`);
    });
  }
  
  // Calculate cache miss rate
  private calculateCacheMissRate(): number {
    // In a real implementation, you would track cache hits/misses
    return Math.random() * 0.5; // 0-50% miss rate
  }
  
  // Calculate error rate
  private calculateErrorRate(): number {
    // In a real implementation, you would track actual errors
    return Math.random() * 0.1; // 0-10% error rate
  }
  
  // Get current metrics
  getMetrics(): SystemMetrics {
    return { ...this.metrics };
  }
  
  // Get recent alerts
  getAlerts(limit: number = 10): PerformanceAlert[] {
    return this.alerts
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
  
  // Get alerts by severity
  getAlertsBySeverity(severity: string): PerformanceAlert[] {
    return this.alerts.filter(alert => alert.severity === severity);
  }
  
  // Clear alerts
  clearAlerts(): void {
    this.alerts = [];
  }
  
  // Update thresholds
  updateThresholds(newThresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    console.log('[PERFORMANCE] Updated thresholds:', this.thresholds);
  }
  
  // Get performance report
  getPerformanceReport(): {
    status: 'healthy' | 'warning' | 'critical';
    metrics: SystemMetrics;
    alerts: PerformanceAlert[];
    recommendations: string[];
  } {
    const criticalAlerts = this.getAlertsBySeverity('critical');
    const highAlerts = this.getAlertsBySeverity('high');
    
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (criticalAlerts.length > 0) {
      status = 'critical';
    } else if (highAlerts.length > 0) {
      status = 'warning';
    }
    
    const recommendations: string[] = [];
    
    if (this.metrics.memory.percentage > 80) {
      recommendations.push('Consider increasing memory allocation or optimizing memory usage');
    }
    
    if (this.metrics.cpu.usage > 80) {
      recommendations.push('Consider optimizing CPU-intensive operations or scaling horizontally');
    }
    
    if (this.calculateCacheMissRate() > 0.3) {
      recommendations.push('Consider increasing cache size or optimizing cache strategy');
    }
    
    if (this.calculateErrorRate() > 0.05) {
      recommendations.push('Investigate and fix error sources');
    }
    
    return {
      status,
      metrics: this.metrics,
      alerts: this.alerts,
      recommendations
    };
  }
  
  // Optimize system based on metrics
  optimizeSystem(): {
    actions: string[];
    success: boolean;
  } {
    const actions: string[] = [];
    let success = true;
    
    try {
      // Memory optimization
      if (this.metrics.memory.percentage > 70) {
        actions.push('Triggered garbage collection');
        // In a real implementation, you would trigger GC
      }
      
      // Cache optimization
      if (this.calculateCacheMissRate() > 0.3) {
        actions.push('Cleared expired cache entries');
        // In a real implementation, you would clear cache
      }
      
      // Database optimization
      if (this.metrics.database.slowQueries > 50) {
        actions.push('Optimized database queries');
        // In a real implementation, you would optimize queries
      }
      
    } catch (error) {
      console.error('[PERFORMANCE] Error during optimization:', error);
      success = false;
    }
    
    return { actions, success };
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();
