// Custom Strategy Builder
// Advanced strategy creation with visual editor and JavaScript support

import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Plus, 
  Trash2, 
  Code, 
  Play, 
  Save, 
  Download, 
  Upload, 
  Eye, 
  Settings,
  Zap,
  AlertTriangle,
  CheckCircle,
  Info,
  Copy,
  Edit3
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CustomStrategy {
  id?: string;
  name: string;
  description: string;
  type: 'visual' | 'javascript' | 'template';
  symbol: string;
  timeframe: string;
  code?: string;
  visualConfig?: any;
  templateId?: string;
  parameters: Record<string, any>;
  validation?: {
    valid: boolean;
    score: number;
    errors: string[];
    warnings: string[];
  };
}

interface StrategyBlock {
  id: string;
  type: 'condition' | 'action' | 'indicator' | 'logic';
  name: string;
  config: any;
  position: { x: number; y: number };
  connections: string[];
}

interface VisualEditor {
  blocks: StrategyBlock[];
  connections: Array<{ from: string; to: string; type: string }>;
  selectedBlock?: string;
}

export const CustomStrategyBuilder = ({ 
  open, 
  onOpenChange, 
  onSuccess, 
  editStrategy 
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editStrategy?: any;
}) => {
  const [strategy, setStrategy] = useState<CustomStrategy>({
    name: '',
    description: '',
    type: 'visual',
    symbol: 'BTCUSDT',
    timeframe: '1h',
    parameters: {}
  });
  
  const [visualEditor, setVisualEditor] = useState<VisualEditor>({
    blocks: [],
    connections: []
  });
  
  const [activeTab, setActiveTab] = useState<'visual' | 'javascript' | 'templates'>('visual');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [validation, setValidation] = useState<any>(null);
  
  // JavaScript editor ref
  const codeEditorRef = useRef<HTMLTextAreaElement>(null);
  
  // Load strategy data when editing
  useEffect(() => {
    if (editStrategy && open) {
      loadStrategyData();
    } else if (!open) {
      resetForm();
    }
  }, [editStrategy, open]);
  
  const loadStrategyData = async () => {
    // Load existing strategy data
    if (editStrategy) {
      setStrategy({
        id: editStrategy.id,
        name: editStrategy.name,
        description: editStrategy.description,
        type: editStrategy.type || 'visual',
        symbol: editStrategy.symbol,
        timeframe: editStrategy.timeframe,
        code: editStrategy.code,
        visualConfig: editStrategy.visual_config,
        templateId: editStrategy.template_id,
        parameters: editStrategy.parameters || {}
      });
      
      if (editStrategy.visual_config) {
        setVisualEditor(editStrategy.visual_config);
      }
    }
  };
  
  const resetForm = () => {
    setStrategy({
      name: '',
      description: '',
      type: 'visual',
      symbol: 'BTCUSDT',
      timeframe: '1h',
      parameters: {}
    });
    setVisualEditor({ blocks: [], connections: [] });
    setValidation(null);
  };
  
  // Visual Editor Functions
  const addBlock = (type: string) => {
    const newBlock: StrategyBlock = {
      id: `block_${Date.now()}`,
      type: type as any,
      name: `${type}_${visualEditor.blocks.length + 1}`,
      config: {},
      position: { x: 100, y: 100 + visualEditor.blocks.length * 150 },
      connections: []
    };
    
    setVisualEditor(prev => ({
      ...prev,
      blocks: [...prev.blocks, newBlock]
    }));
  };
  
  const updateBlock = (blockId: string, updates: Partial<StrategyBlock>) => {
    setVisualEditor(prev => ({
      ...prev,
      blocks: prev.blocks.map(block => 
        block.id === blockId ? { ...block, ...updates } : block
      )
    }));
  };
  
  const deleteBlock = (blockId: string) => {
    setVisualEditor(prev => ({
      ...prev,
      blocks: prev.blocks.filter(block => block.id !== blockId),
      connections: prev.connections.filter(conn => 
        conn.from !== blockId && conn.to !== blockId
      )
    }));
  };
  
  const addConnection = (from: string, to: string, type: string) => {
    setVisualEditor(prev => ({
      ...prev,
      connections: [...prev.connections, { from, to, type }]
    }));
  };
  
  // JavaScript Code Templates
  const getCodeTemplate = (type: string) => {
    const templates = {
      'momentum': `
// Momentum Strategy
function evaluateMomentum(candles, config) {
  const closes = candles.map(c => c.close);
  const rsi = calculateRSI(closes, 14);
  const currentRSI = rsi[rsi.length - 1];
  
  // Buy when RSI < 30 (oversold)
  if (currentRSI < 30) {
    return { signal: 'BUY', confidence: 0.8, reason: 'RSI oversold' };
  }
  
  // Sell when RSI > 70 (overbought)
  if (currentRSI > 70) {
    return { signal: 'SELL', confidence: 0.8, reason: 'RSI overbought' };
  }
  
  return { signal: 'HOLD', confidence: 0.5, reason: 'No clear signal' };
}`,
      
      'trend': `
// Trend Following Strategy
function evaluateTrend(candles, config) {
  const closes = candles.map(c => c.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  
  const currentPrice = closes[closes.length - 1];
  const currentEMA20 = ema20[ema20.length - 1];
  const currentEMA50 = ema50[ema50.length - 1];
  
  // Buy when price > EMA20 > EMA50 (uptrend)
  if (currentPrice > currentEMA20 && currentEMA20 > currentEMA50) {
    return { signal: 'BUY', confidence: 0.9, reason: 'Strong uptrend' };
  }
  
  // Sell when price < EMA20 < EMA50 (downtrend)
  if (currentPrice < currentEMA20 && currentEMA20 < currentEMA50) {
    return { signal: 'SELL', confidence: 0.9, reason: 'Strong downtrend' };
  }
  
  return { signal: 'HOLD', confidence: 0.5, reason: 'No clear trend' };
}`,
      
      'mean_reversion': `
// Mean Reversion Strategy
function evaluateMeanReversion(candles, config) {
  const closes = candles.map(c => c.close);
  const bb = calculateBollingerBands(closes, 20, 2);
  
  const currentPrice = closes[closes.length - 1];
  const upperBand = bb.upper[bb.upper.length - 1];
  const lowerBand = bb.lower[bb.lower.length - 1];
  
  // Buy when price touches lower band
  if (currentPrice <= lowerBand) {
    return { signal: 'BUY', confidence: 0.8, reason: 'Price at lower Bollinger Band' };
  }
  
  // Sell when price touches upper band
  if (currentPrice >= upperBand) {
    return { signal: 'SELL', confidence: 0.8, reason: 'Price at upper Bollinger Band' };
  }
  
  return { signal: 'HOLD', confidence: 0.5, reason: 'Price in middle range' };
}`
    };
    
    return templates[type] || '';
  };
  
  // Strategy Templates
  const strategyTemplates = [
    {
      id: 'momentum_scalping',
      name: 'Momentum Scalping',
      description: 'High-frequency momentum strategy for scalping',
      type: 'javascript',
      code: getCodeTemplate('momentum'),
      parameters: { timeframe: '1m', risk: 0.02 }
    },
    {
      id: 'trend_following',
      name: 'Trend Following',
      description: 'Classic trend following strategy',
      type: 'javascript',
      code: getCodeTemplate('trend'),
      parameters: { timeframe: '4h', risk: 0.05 }
    },
    {
      id: 'mean_reversion',
      name: 'Mean Reversion',
      description: 'Mean reversion strategy using Bollinger Bands',
      type: 'javascript',
      code: getCodeTemplate('mean_reversion'),
      parameters: { timeframe: '1h', risk: 0.03 }
    }
  ];
  
  const loadTemplate = (template: any) => {
    setStrategy(prev => ({
      ...prev,
      name: template.name,
      description: template.description,
      type: template.type,
      code: template.code,
      parameters: template.parameters
    }));
    
    if (template.type === 'javascript') {
      setActiveTab('javascript');
    }
  };
  
  // Validation
  const validateStrategy = async () => {
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('validate-strategy', {
        body: {
          strategy: {
            ...strategy,
            visual_config: visualEditor
          },
          runTests: true
        }
      });
      
      if (error) throw error;
      
      setValidation(data.validation);
      
      toast({
        title: "Validation Complete",
        description: `Strategy validation completed with score: ${data.validation.score}/100`,
        variant: data.validation.valid ? "default" : "destructive",
      });
    } catch (error) {
      console.error('Validation error:', error);
      toast({
        title: "Validation Error",
        description: "Failed to validate strategy",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };
  
  // Save Strategy
  const handleSave = async () => {
    if (!strategy.name.trim()) {
      toast({
        title: "Error",
        description: "Strategy name is required",
        variant: "destructive",
      });
      return;
    }
    
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      const strategyData = {
        name: strategy.name,
        description: strategy.description,
        symbol: strategy.symbol,
        timeframe: strategy.timeframe,
        strategy_type: 'custom',
        type: strategy.type,
        code: strategy.code,
        visual_config: visualEditor,
        template_id: strategy.templateId,
        parameters: strategy.parameters,
        user_id: user.id
      };
      
      if (editStrategy) {
        // Update existing strategy
        const { error } = await supabase
          .from('strategies')
          .update(strategyData)
          .eq('id', editStrategy.id);
        
        if (error) throw error;
      } else {
        // Create new strategy
        const { error } = await supabase
          .from('strategies')
          .insert([strategyData]);
        
        if (error) throw error;
      }
      
      toast({
        title: "Success",
        description: "Strategy saved successfully",
      });
      
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: "Error",
        description: "Failed to save strategy",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };
  
  // Export/Import
  const exportStrategy = () => {
    const data = {
      ...strategy,
      visual_config: visualEditor
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${strategy.name || 'strategy'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const importStrategy = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        setStrategy(data);
        if (data.visual_config) {
          setVisualEditor(data.visual_config);
        }
        toast({
          title: "Success",
          description: "Strategy imported successfully",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to import strategy",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            {editStrategy ? "Edit Custom Strategy" : "Create Custom Strategy"}
          </DialogTitle>
          <DialogDescription>
            Build advanced trading strategies with visual editor or JavaScript code
          </DialogDescription>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="visual">Visual Editor</TabsTrigger>
            <TabsTrigger value="javascript">JavaScript</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>
          
          <TabsContent value="visual" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Strategy Name</Label>
                  <Input
                    id="name"
                    value={strategy.name}
                    onChange={(e) => setStrategy(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter strategy name"
                  />
                </div>
                
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={strategy.description}
                    onChange={(e) => setStrategy(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe your strategy"
                    rows={3}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="symbol">Symbol</Label>
                    <Input
                      id="symbol"
                      value={strategy.symbol}
                      onChange={(e) => setStrategy(prev => ({ ...prev, symbol: e.target.value }))}
                      placeholder="BTCUSDT"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="timeframe">Timeframe</Label>
                    <Select value={strategy.timeframe} onValueChange={(value) => setStrategy(prev => ({ ...prev, timeframe: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1m">1 Minute</SelectItem>
                        <SelectItem value="5m">5 Minutes</SelectItem>
                        <SelectItem value="15m">15 Minutes</SelectItem>
                        <SelectItem value="1h">1 Hour</SelectItem>
                        <SelectItem value="4h">4 Hours</SelectItem>
                        <SelectItem value="1d">1 Day</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Button onClick={() => addBlock('condition')} size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Condition
                  </Button>
                  <Button onClick={() => addBlock('action')} size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Action
                  </Button>
                  <Button onClick={() => addBlock('indicator')} size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Indicator
                  </Button>
                </div>
                
                <div className="border rounded-lg p-4 min-h-[300px] bg-gray-50">
                  <div className="text-sm text-gray-500 mb-2">Visual Strategy Builder</div>
                  {visualEditor.blocks.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">
                      Click the buttons above to add blocks to your strategy
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {visualEditor.blocks.map((block) => (
                        <Card key={block.id} className="p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <Badge variant="outline">{block.type}</Badge>
                              <span className="ml-2 text-sm">{block.name}</span>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteBlock(block.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="javascript" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="code">JavaScript Strategy Code</Label>
                <div className="flex gap-2">
                  <Button onClick={() => setStrategy(prev => ({ ...prev, code: getCodeTemplate('momentum') }))} size="sm" variant="outline">
                    Momentum
                  </Button>
                  <Button onClick={() => setStrategy(prev => ({ ...prev, code: getCodeTemplate('trend') }))} size="sm" variant="outline">
                    Trend
                  </Button>
                  <Button onClick={() => setStrategy(prev => ({ ...prev, code: getCodeTemplate('mean_reversion') }))} size="sm" variant="outline">
                    Mean Reversion
                  </Button>
                </div>
              </div>
              
              <Textarea
                ref={codeEditorRef}
                value={strategy.code || ''}
                onChange={(e) => setStrategy(prev => ({ ...prev, code: e.target.value }))}
                placeholder="Enter your JavaScript strategy code here..."
                rows={20}
                className="font-mono text-sm"
              />
              
              <div className="text-sm text-gray-500">
                <Info className="h-4 w-4 inline mr-1" />
                Available functions: calculateRSI, calculateEMA, calculateMACD, calculateBollingerBands, etc.
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="templates" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {strategyTemplates.map((template) => (
                <Card key={template.id} className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600 mb-3">{template.description}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{template.type}</Badge>
                      <Badge variant="secondary">{template.parameters.timeframe}</Badge>
                    </div>
                    <Button 
                      onClick={() => loadTemplate(template)} 
                      className="w-full mt-3"
                      size="sm"
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Use Template
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
        
        {/* Validation Results */}
        {validation && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {validation.valid ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                )}
                Validation Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Score:</span>
                  <Badge variant={validation.valid ? "default" : "destructive"}>
                    {validation.score}/100
                  </Badge>
                </div>
                
                {validation.errors.length > 0 && (
                  <div>
                    <span className="font-medium text-red-600">Errors:</span>
                    <ul className="list-disc list-inside text-sm text-red-600">
                      {validation.errors.map((error, idx) => (
                        <li key={idx}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {validation.warnings.length > 0 && (
                  <div>
                    <span className="font-medium text-yellow-600">Warnings:</span>
                    <ul className="list-disc list-inside text-sm text-yellow-600">
                      {validation.warnings.map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex gap-2">
            <Button onClick={validateStrategy} disabled={testing} variant="outline">
              {testing ? (
                <>
                  <Play className="h-4 w-4 mr-1 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  Test Strategy
                </>
              )}
            </Button>
            
            <Button onClick={exportStrategy} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
            
            <label className="cursor-pointer">
              <Button asChild variant="outline" size="sm">
                <span>
                  <Upload className="h-4 w-4 mr-1" />
                  Import
                </span>
              </Button>
              <input
                type="file"
                accept=".json"
                onChange={importStrategy}
                className="hidden"
              />
            </label>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={() => onOpenChange(false)} variant="outline">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Save className="h-4 w-4 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  Save Strategy
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
