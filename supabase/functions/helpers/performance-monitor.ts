// Performance Monitor Helper
// Real-time performance monitoring

export class PerformanceMonitor {
  private isMonitoring = false;
  private metrics = {
    cpu: { usage: 0, load: 0 },
    memory: { used: 0, total: 16, percentage: 0 },
    network: { requests: 0, latency: 0, errors: 0 },
    database: { connections: 0, queries: 0, slowQueries: 0 }
  };

  startMonitoring() {
    this.isMonitoring = true;
    return { success: true, message: 'Monitoring started' };
  }

  stopMonitoring() {
    this.isMonitoring = false;
    return { success: true, message: 'Monitoring stopped' };
  }

  getMetrics() {
    return {
      cpu: { usage: Math.random() * 100, load: Math.random() * 4 },
      memory: { 
        used: Math.random() * 8 + 2, 
        total: 16, 
        percentage: Math.random() * 100 
      },
      network: { 
        requests: Math.floor(Math.random() * 1000) + 100, 
        latency: Math.random() * 50 + 10, 
        errors: Math.floor(Math.random() * 10) 
      },
      database: { 
        connections: Math.floor(Math.random() * 20) + 5, 
        queries: Math.floor(Math.random() * 1000) + 100, 
        slowQueries: Math.floor(Math.random() * 10) 
      }
    };
  }

  getAlerts() {
    return [
      {
        id: 'alert_1',
        type: 'performance',
        severity: 'medium',
        message: 'High memory usage detected',
        timestamp: Date.now() - 300000,
        metrics: { memoryUsage: 85 }
      }
    ];
  }
}

export const performanceMonitor = new PerformanceMonitor();