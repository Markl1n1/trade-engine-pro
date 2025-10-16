// Strategy Template Library
// Pre-built strategy templates for common trading patterns

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Search, 
  Filter, 
  Star, 
  TrendingUp, 
  TrendingDown, 
  Zap, 
  Shield, 
  Target,
  Copy,
  Eye,
  Download,
  Info
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  category: 'momentum' | 'trend' | 'reversion' | 'scalping' | 'swing' | 'arbitrage';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  risk: 'low' | 'medium' | 'high';
  timeframe: string[];
  indicators: string[];
  code: string;
  parameters: Record<string, any>;
  performance?: {
    winRate: number;
    profitFactor: number;
    maxDrawdown: number;
    sharpeRatio: number;
  };
  tags: string[];
  author: string;
  version: string;
  createdAt: string;
  downloads: number;
  rating: number;
}

export const StrategyTemplateLibrary = ({ 
  onSelectTemplate,
  onPreviewTemplate 
}: {
  onSelectTemplate: (template: StrategyTemplate) => void;
  onPreviewTemplate: (template: StrategyTemplate) => void;
}) => {
  const [templates, setTemplates] = useState<StrategyTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<StrategyTemplate[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [selectedRisk, setSelectedRisk] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('popularity');
  const [loading, setLoading] = useState(true);

  // Pre-defined strategy templates
  const predefinedTemplates: StrategyTemplate[] = [
    {
      id: 'momentum_breakout',
      name: 'Momentum Breakout',
      description: 'Captures strong momentum moves with volume confirmation',
      category: 'momentum',
      difficulty: 'intermediate',
      risk: 'medium',
      timeframe: ['5m', '15m', '1h'],
      indicators: ['RSI', 'MACD', 'Volume', 'ATR'],
      code: `
function evaluateMomentumBreakout(candles, config) {
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  
  // Calculate indicators
  const rsi = calculateRSI(closes, 14);
  const macd = calculateMACD(closes);
  const atr = calculateATR(candles, 14);
  
  const currentRSI = rsi[rsi.length - 1];
  const currentMACD = macd.macd[macd.macd.length - 1];
  const currentSignal = macd.signal[macd.signal.length - 1];
  const currentATR = atr[atr.length - 1];
  
  // Volume analysis
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const currentVolume = volumes[volumes.length - 1];
  const volumeRatio = currentVolume / avgVolume;
  
  // Breakout detection
  const recentHigh = Math.max(...highs.slice(-20));
  const currentPrice = closes[closes.length - 1];
  const breakoutThreshold = recentHigh * 1.001; // 0.1% above recent high
  
  // Buy conditions
  if (currentPrice > breakoutThreshold && 
      currentRSI > 50 && 
      currentRSI < 80 &&
      currentMACD > currentSignal &&
      volumeRatio > 1.5) {
    return {
      signal: 'BUY',
      confidence: Math.min(0.9, (currentRSI - 50) / 30 * 0.5 + volumeRatio / 3 * 0.3),
      reason: 'Momentum breakout with volume confirmation'
    };
  }
  
  // Sell conditions
  if (currentRSI > 80 || 
      (currentMACD < currentSignal && currentRSI < 50)) {
    return {
      signal: 'SELL',
      confidence: 0.8,
      reason: 'Momentum exhaustion or reversal'
    };
  }
  
  return { signal: 'HOLD', confidence: 0.5, reason: 'No clear signal' };
}`,
      parameters: {
        rsiPeriod: 14,
        macdFast: 12,
        macdSlow: 26,
        macdSignal: 9,
        atrPeriod: 14,
        volumeMultiplier: 1.5,
        breakoutThreshold: 0.001
      },
      performance: {
        winRate: 65,
        profitFactor: 1.8,
        maxDrawdown: 15,
        sharpeRatio: 1.2
      },
      tags: ['momentum', 'breakout', 'volume', 'scalping'],
      author: 'TradingBot Pro',
      version: '1.0.0',
      createdAt: '2024-01-01',
      downloads: 1250,
      rating: 4.5
    },
    
    {
      id: 'trend_following_ema',
      name: 'EMA Trend Following',
      description: 'Classic trend following strategy using EMA crossovers',
      category: 'trend',
      difficulty: 'beginner',
      risk: 'low',
      timeframe: ['1h', '4h', '1d'],
      indicators: ['EMA', 'ATR', 'Volume'],
      code: `
function evaluateTrendFollowing(candles, config) {
  const closes = candles.map(c => c.close);
  
  // Calculate EMAs
  const emaFast = calculateEMA(closes, config.emaFast);
  const emaSlow = calculateEMA(closes, config.emaSlow);
  const atr = calculateATR(candles, config.atrPeriod);
  
  const currentPrice = closes[closes.length - 1];
  const currentEMAFast = emaFast[emaFast.length - 1];
  const currentEMASlow = emaSlow[emaSlow.length - 1];
  const currentATR = atr[atr.length - 1];
  
  // Trend direction
  const trendUp = currentEMAFast > currentEMASlow;
  const trendDown = currentEMAFast < currentEMASlow;
  
  // Price position relative to EMAs
  const priceAboveEMAs = currentPrice > currentEMAFast && currentPrice > currentEMASlow;
  const priceBelowEMAs = currentPrice < currentEMAFast && currentPrice < currentEMASlow;
  
  // Buy signal: EMA crossover + price above EMAs
  if (trendUp && priceAboveEMAs) {
    return {
      signal: 'BUY',
      confidence: 0.8,
      reason: 'Strong uptrend with price above EMAs'
    };
  }
  
  // Sell signal: EMA crossover + price below EMAs
  if (trendDown && priceBelowEMAs) {
    return {
      signal: 'SELL',
      confidence: 0.8,
      reason: 'Strong downtrend with price below EMAs'
    };
  }
  
  return { signal: 'HOLD', confidence: 0.5, reason: 'No clear trend' };
}`,
      parameters: {
        emaFast: 20,
        emaSlow: 50,
        atrPeriod: 14
      },
      performance: {
        winRate: 58,
        profitFactor: 1.5,
        maxDrawdown: 12,
        sharpeRatio: 1.0
      },
      tags: ['trend', 'ema', 'crossover', 'swing'],
      author: 'TradingBot Pro',
      version: '1.0.0',
      createdAt: '2024-01-01',
      downloads: 2100,
      rating: 4.2
    },
    
    {
      id: 'mean_reversion_bb',
      name: 'Bollinger Bands Mean Reversion',
      description: 'Mean reversion strategy using Bollinger Bands',
      category: 'reversion',
      difficulty: 'intermediate',
      risk: 'medium',
      timeframe: ['15m', '1h', '4h'],
      indicators: ['Bollinger Bands', 'RSI', 'Volume'],
      code: `
function evaluateMeanReversion(candles, config) {
  const closes = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  
  // Calculate indicators
  const bb = calculateBollingerBands(closes, config.bbPeriod, config.bbDeviation);
  const rsi = calculateRSI(closes, config.rsiPeriod);
  
  const currentPrice = closes[closes.length - 1];
  const currentUpper = bb.upper[bb.upper.length - 1];
  const currentLower = bb.lower[bb.lower.length - 1];
  const currentMiddle = bb.middle[bb.middle.length - 1];
  const currentRSI = rsi[rsi.length - 1];
  
  // Volume analysis
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const currentVolume = volumes[volumes.length - 1];
  const volumeRatio = currentVolume / avgVolume;
  
  // Buy signal: Price at lower band + RSI oversold
  if (currentPrice <= currentLower && currentRSI < 30 && volumeRatio > 1.2) {
    return {
      signal: 'BUY',
      confidence: 0.85,
      reason: 'Price at lower Bollinger Band with oversold RSI'
    };
  }
  
  // Sell signal: Price at upper band + RSI overbought
  if (currentPrice >= currentUpper && currentRSI > 70 && volumeRatio > 1.2) {
    return {
      signal: 'SELL',
      confidence: 0.85,
      reason: 'Price at upper Bollinger Band with overbought RSI'
    };
  }
  
  return { signal: 'HOLD', confidence: 0.5, reason: 'No reversion signal' };
}`,
      parameters: {
        bbPeriod: 20,
        bbDeviation: 2,
        rsiPeriod: 14
      },
      performance: {
        winRate: 62,
        profitFactor: 1.6,
        maxDrawdown: 18,
        sharpeRatio: 0.9
      },
      tags: ['mean-reversion', 'bollinger-bands', 'rsi', 'swing'],
      author: 'TradingBot Pro',
      version: '1.0.0',
      createdAt: '2024-01-01',
      downloads: 1800,
      rating: 4.3
    },
    
    {
      id: 'scalping_rsi',
      name: 'RSI Scalping',
      description: 'High-frequency scalping strategy using RSI',
      category: 'scalping',
      difficulty: 'advanced',
      risk: 'high',
      timeframe: ['1m', '5m'],
      indicators: ['RSI', 'EMA', 'ATR'],
      code: `
function evaluateScalpingRSI(candles, config) {
  const closes = candles.map(c => c.close);
  
  // Calculate indicators
  const rsi = calculateRSI(closes, config.rsiPeriod);
  const ema = calculateEMA(closes, config.emaPeriod);
  const atr = calculateATR(candles, config.atrPeriod);
  
  const currentPrice = closes[closes.length - 1];
  const currentRSI = rsi[rsi.length - 1];
  const currentEMA = ema[ema.length - 1];
  const currentATR = atr[atr.length - 1];
  
  // Trend filter
  const trendUp = currentPrice > currentEMA;
  const trendDown = currentPrice < currentEMA;
  
  // Buy signal: RSI oversold in uptrend
  if (trendUp && currentRSI < 30) {
    return {
      signal: 'BUY',
      confidence: 0.9,
      reason: 'RSI oversold in uptrend'
    };
  }
  
  // Sell signal: RSI overbought in downtrend
  if (trendDown && currentRSI > 70) {
    return {
      signal: 'SELL',
      confidence: 0.9,
      reason: 'RSI overbought in downtrend'
    };
  }
  
  return { signal: 'HOLD', confidence: 0.5, reason: 'No scalping opportunity' };
}`,
      parameters: {
        rsiPeriod: 14,
        emaPeriod: 20,
        atrPeriod: 14
      },
      performance: {
        winRate: 72,
        profitFactor: 2.1,
        maxDrawdown: 25,
        sharpeRatio: 1.5
      },
      tags: ['scalping', 'rsi', 'high-frequency', 'momentum'],
      author: 'TradingBot Pro',
      version: '1.0.0',
      createdAt: '2024-01-01',
      downloads: 950,
      rating: 4.1
    }
  ];

  useEffect(() => {
    setTemplates(predefinedTemplates);
    setFilteredTemplates(predefinedTemplates);
    setLoading(false);
  }, []);

  // Filter and search templates
  useEffect(() => {
    let filtered = templates;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(template =>
        template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        template.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(template => template.category === selectedCategory);
    }

    // Difficulty filter
    if (selectedDifficulty !== 'all') {
      filtered = filtered.filter(template => template.difficulty === selectedDifficulty);
    }

    // Risk filter
    if (selectedRisk !== 'all') {
      filtered = filtered.filter(template => template.risk === selectedRisk);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'popularity':
          return b.downloads - a.downloads;
        case 'rating':
          return b.rating - a.rating;
        case 'name':
          return a.name.localeCompare(b.name);
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        default:
          return 0;
      }
    });

    setFilteredTemplates(filtered);
  }, [templates, searchTerm, selectedCategory, selectedDifficulty, selectedRisk, sortBy]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'momentum': return <Zap className="h-4 w-4" />;
      case 'trend': return <TrendingUp className="h-4 w-4" />;
      case 'reversion': return <TrendingDown className="h-4 w-4" />;
      case 'scalping': return <Target className="h-4 w-4" />;
      case 'swing': return <Shield className="h-4 w-4" />;
      default: return <Info className="h-4 w-4" />;
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return 'bg-green-100 text-green-800';
      case 'intermediate': return 'bg-yellow-100 text-yellow-800';
      case 'advanced': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Strategy Templates</h2>
          <p className="text-gray-600">Choose from pre-built strategy templates</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{filteredTemplates.length} templates</Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
          />
        </div>
        
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="momentum">Momentum</SelectItem>
            <SelectItem value="trend">Trend</SelectItem>
            <SelectItem value="reversion">Reversion</SelectItem>
            <SelectItem value="scalping">Scalping</SelectItem>
            <SelectItem value="swing">Swing</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="beginner">Beginner</SelectItem>
            <SelectItem value="intermediate">Intermediate</SelectItem>
            <SelectItem value="advanced">Advanced</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={selectedRisk} onValueChange={setSelectedRisk}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Risk" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risks</SelectItem>
            <SelectItem value="low">Low Risk</SelectItem>
            <SelectItem value="medium">Medium Risk</SelectItem>
            <SelectItem value="high">High Risk</SelectItem>
          </SelectContent>
        </Select>
        
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popularity">Popularity</SelectItem>
            <SelectItem value="rating">Rating</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="newest">Newest</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="text-center py-8">Loading templates...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {getCategoryIcon(template.category)}
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm font-medium">{template.rating}</span>
                  </div>
                </div>
                <p className="text-sm text-gray-600">{template.description}</p>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  <Badge className={getDifficultyColor(template.difficulty)}>
                    {template.difficulty}
                  </Badge>
                  <Badge className={getRiskColor(template.risk)}>
                    {template.risk} risk
                  </Badge>
                  <Badge variant="outline">
                    {template.downloads} downloads
                  </Badge>
                </div>
                
                {/* Indicators */}
                <div>
                  <span className="text-sm font-medium">Indicators:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {template.indicators.map((indicator) => (
                      <Badge key={indicator} variant="secondary" className="text-xs">
                        {indicator}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                {/* Timeframes */}
                <div>
                  <span className="text-sm font-medium">Timeframes:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {template.timeframe.map((tf) => (
                      <Badge key={tf} variant="outline" className="text-xs">
                        {tf}
                      </Badge>
                    ))}
                  </div>
                </div>
                
                {/* Performance */}
                {template.performance && (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-600">Win Rate:</span>
                      <span className="ml-1 font-medium">{template.performance.winRate}%</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Profit Factor:</span>
                      <span className="ml-1 font-medium">{template.performance.profitFactor}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Max DD:</span>
                      <span className="ml-1 font-medium">{template.performance.maxDrawdown}%</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Sharpe:</span>
                      <span className="ml-1 font-medium">{template.performance.sharpeRatio}</span>
                    </div>
                  </div>
                )}
                
                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    onClick={() => onSelectTemplate(template)}
                    className="flex-1"
                    size="sm"
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Use Template
                  </Button>
                  <Button
                    onClick={() => onPreviewTemplate(template)}
                    variant="outline"
                    size="sm"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {filteredTemplates.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-500">
          No templates found matching your criteria
        </div>
      )}
    </div>
  );
};

