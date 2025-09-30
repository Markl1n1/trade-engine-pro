import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, Activity, BarChart3, Zap } from "lucide-react";

interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  usage_count: number;
  template_data: any;
}

interface StrategyTemplatesProps {
  onSelectTemplate: (template: StrategyTemplate) => void;
}

const categoryIcons: Record<string, any> = {
  'Moving Average': TrendingUp,
  'Oscillator': Activity,
  'Momentum': Zap,
  'Volatility': BarChart3,
  'Trend': TrendingUp,
};

export function StrategyTemplates({ onSelectTemplate }: StrategyTemplatesProps) {
  const [templates, setTemplates] = useState<StrategyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('strategy_templates')
        .select('*')
        .eq('is_public', true)
        .order('usage_count', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading templates",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUseTemplate = async (template: StrategyTemplate) => {
    try {
      // Increment usage count
      await supabase
        .from('strategy_templates')
        .update({ usage_count: template.usage_count + 1 })
        .eq('id', template.id);

      onSelectTemplate(template);
      
      toast({
        title: "Template loaded",
        description: `${template.name} has been loaded successfully`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading templates...</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {templates.map((template) => {
        const Icon = categoryIcons[template.category] || TrendingUp;
        return (
          <Card key={template.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <Icon className="h-8 w-8 text-primary" />
                <Badge variant="secondary">{template.category}</Badge>
              </div>
              <CardTitle className="text-lg">{template.name}</CardTitle>
              <CardDescription className="line-clamp-2">
                {template.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Used {template.usage_count} times
                </span>
                <Button 
                  size="sm" 
                  onClick={() => handleUseTemplate(template)}
                >
                  Use Template
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
