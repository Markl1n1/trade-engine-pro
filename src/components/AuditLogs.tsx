import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Activity, 
  Calendar, 
  Filter, 
  RefreshCw, 
  Trash2, 
  Eye, 
  Clock, 
  User, 
  Settings, 
  Zap,
  AlertTriangle,
  CheckCircle,
  Info
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AuditLog {
  id: string;
  action_type: string;
  entity_type: string;
  entity_id?: string;
  old_values?: any;
  new_values?: any;
  changed_fields?: string[];
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

interface AuditStats {
  total_logs: number;
  logs_last_24h: number;
  logs_last_7d: number;
  logs_last_30d: number;
  oldest_log: string;
  newest_log: string;
}

export const AuditLogs = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [filters, setFilters] = useState({
    action_type: 'all',
    entity_type: 'all',
    limit: 50
  });
  const { toast } = useToast();

  const loadAuditLogs = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.functions.invoke('get-audit-logs', {
        body: {
          action: 'get_logs',
          limit: filters.limit,
          offset: currentPage * filters.limit,
          action_type: filters.action_type === 'all' ? undefined : filters.action_type || undefined,
          entity_type: filters.entity_type === 'all' ? undefined : filters.entity_type || undefined
        }
      });

      if (error) throw error;
      if (data?.success && Array.isArray(data.data)) {
        setLogs(data.data);
        setTotalPages(Math.ceil(data.data.length / filters.limit));
      } else {
        setLogs([]);
        setTotalPages(0);
      }
    } catch (error: any) {
      console.error('Error loading audit logs:', error);
      toast({
        title: "Error",
        description: "Failed to load audit logs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-audit-logs', {
        body: { action: 'get_stats' }
      });

      if (error) throw error;
      if (data?.success && data.data) {
        setStats(data.data);
      }
    } catch (error: any) {
      console.error('Error loading audit stats:', error);
    }
  };

  const cleanupLogs = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.functions.invoke('get-audit-logs', {
        body: { action: 'cleanup' }
      });

      if (error) throw error;
      if (data?.success && data.data) {
        toast({
          title: "Success",
          description: `Cleaned up ${data.data.deleted_count || 0} audit logs`,
        });
        await loadAuditLogs();
        await loadStats();
      }
    } catch (error: any) {
      console.error('Error cleaning up audit logs:', error);
      toast({
        title: "Error",
        description: "Failed to cleanup audit logs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditLogs();
    loadStats();
  }, [currentPage, filters]);

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'settings_change': return <Settings className="h-4 w-4" />;
      case 'strategy_change': return <Zap className="h-4 w-4" />;
      case 'strategy_created': return <CheckCircle className="h-4 w-4" />;
      case 'strategy_deleted': return <Trash2 className="h-4 w-4" />;
      case 'position_change': return <Activity className="h-4 w-4" />;
      default: return <Info className="h-4 w-4" />;
    }
  };

  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case 'settings_change': return 'bg-blue-500';
      case 'strategy_change': return 'bg-yellow-500';
      case 'strategy_created': return 'bg-green-500';
      case 'strategy_deleted': return 'bg-red-500';
      case 'position_change': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatChangedFields = (fields: string[]) => {
    return fields.join(', ');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Audit Logs</h2>
          <p className="text-sm text-muted-foreground">
            Track all changes and system activities
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              loadAuditLogs();
              loadStats();
            }}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button 
            variant="destructive" 
            size="sm"
            onClick={cleanupLogs}
            disabled={loading}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Cleanup
          </Button>
        </div>
      </div>

      <Tabs defaultValue="logs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="logs">Audit Logs</TabsTrigger>
          <TabsTrigger value="stats">Statistics</TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Action Type</label>
                  <Select 
                    value={filters.action_type} 
                    onValueChange={(value) => setFilters(prev => ({ ...prev, action_type: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All actions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All actions</SelectItem>
                      <SelectItem value="settings_change">Settings Change</SelectItem>
                      <SelectItem value="strategy_change">Strategy Change</SelectItem>
                      <SelectItem value="strategy_created">Strategy Created</SelectItem>
                      <SelectItem value="strategy_deleted">Strategy Deleted</SelectItem>
                      <SelectItem value="position_change">Position Change</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Entity Type</label>
                  <Select 
                    value={filters.entity_type} 
                    onValueChange={(value) => setFilters(prev => ({ ...prev, entity_type: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All entities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All entities</SelectItem>
                      <SelectItem value="user_settings">User Settings</SelectItem>
                      <SelectItem value="strategy">Strategy</SelectItem>
                      <SelectItem value="position">Position</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Limit</label>
                  <Select 
                    value={filters.limit.toString()} 
                    onValueChange={(value) => setFilters(prev => ({ ...prev, limit: parseInt(value) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="200">200</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Audit Logs List */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                {logs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No audit logs found
                  </div>
                ) : (
                  <div className="space-y-4">
                    {logs.map((log) => (
                      <div key={log.id} className="p-4 border rounded-lg bg-card">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-full ${getActionColor(log.action_type)}`}>
                              {getActionIcon(log.action_type)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="capitalize">
                                  {log.action_type.replace('_', ' ')}
                                </Badge>
                                <Badge variant="secondary">
                                  {log.entity_type}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {formatTimestamp(log.created_at)}
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        {log.changed_fields && log.changed_fields.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-muted-foreground">
                              Changed fields: {formatChangedFields(log.changed_fields)}
                            </p>
                          </div>
                        )}

                        {log.old_values && log.new_values && (
                          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Old Values</p>
                              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                                {JSON.stringify(log.old_values, null, 2)}
                              </pre>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">New Values</p>
                              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                                {JSON.stringify(log.new_values, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Activity className="h-4 w-4" />
                    Total Logs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.total_logs.toLocaleString()}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4" />
                    Last 24 Hours
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.logs_last_24h.toLocaleString()}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4" />
                    Last 7 Days
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.logs_last_7d.toLocaleString()}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4" />
                    Last 30 Days
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.logs_last_30d.toLocaleString()}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4" />
                    Oldest Log
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    {stats.oldest_log ? formatTimestamp(stats.oldest_log) : 'N/A'}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4" />
                    Newest Log
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-muted-foreground">
                    {stats.newest_log ? formatTimestamp(stats.newest_log) : 'N/A'}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
