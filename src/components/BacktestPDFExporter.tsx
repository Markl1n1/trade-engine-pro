import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface BacktestPDFExporterProps {
  results: any;
  strategyName: string;
  symbol: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  config: {
    initialBalance: string;
    stopLossPercent: string;
    takeProfitPercent: string;
    productType: string;
    leverage: string;
    makerFee: string;
    takerFee: string;
    slippage: string;
    executionTiming: string;
  };
}

export function BacktestPDFExporter({
  results,
  strategyName,
  symbol,
  timeframe,
  startDate,
  endDate,
  config,
}: BacktestPDFExporterProps) {
  const [isExporting, setIsExporting] = useState(false);

  const exportToPDF = async () => {
    setIsExporting(true);
    
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      let yPosition = margin;

      // Helper to add new page if needed
      const checkPageBreak = (requiredSpace: number) => {
        if (yPosition + requiredSpace > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
          return true;
        }
        return false;
      };

      // Page 1: Header and Summary
      pdf.setFontSize(24);
      pdf.setTextColor(59, 130, 246); // primary color
      pdf.text('Backtest Report', margin, yPosition);
      yPosition += 12;

      pdf.setFontSize(10);
      pdf.setTextColor(100, 116, 139); // muted-foreground
      pdf.text(`Generated: ${new Date().toLocaleString()}`, margin, yPosition);
      yPosition += 10;

      // Strategy Info Box
      pdf.setDrawColor(226, 232, 240);
      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(margin, yPosition, pageWidth - 2 * margin, 25, 2, 2, 'FD');
      
      yPosition += 7;
      pdf.setFontSize(11);
      pdf.setTextColor(15, 23, 42);
      pdf.setFont(undefined, 'bold');
      pdf.text(`Strategy: ${strategyName}`, margin + 5, yPosition);
      yPosition += 6;
      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(9);
      pdf.text(`Symbol: ${symbol} | Timeframe: ${timeframe}`, margin + 5, yPosition);
      yPosition += 5;
      pdf.text(`Period: ${startDate} to ${endDate}`, margin + 5, yPosition);
      yPosition += 15;

      // Performance Metrics Cards
      pdf.setFontSize(14);
      pdf.setTextColor(15, 23, 42);
      pdf.setFont(undefined, 'bold');
      pdf.text('Performance Summary', margin, yPosition);
      yPosition += 8;

      const metrics = [
        { 
          label: 'Total Return', 
          value: `${results.total_return >= 0 ? '+' : ''}${results.total_return.toFixed(2)}%`,
          color: results.total_return >= 0 ? [34, 197, 94] : [239, 68, 68]
        },
        { 
          label: 'Win Rate', 
          value: `${results.win_rate.toFixed(1)}%`,
          color: [59, 130, 246]
        },
        { 
          label: 'Max Drawdown', 
          value: `-${results.max_drawdown.toFixed(2)}%`,
          color: [239, 68, 68]
        },
        { 
          label: 'Profit Factor', 
          value: results.profit_factor?.toFixed(2) || 'N/A',
          color: [59, 130, 246]
        },
      ];

      const cardWidth = (pageWidth - 2 * margin - 9) / 2;
      const cardHeight = 20;
      
      metrics.forEach((metric, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        const x = margin + col * (cardWidth + 3);
        const y = yPosition + row * (cardHeight + 3);

        pdf.setDrawColor(226, 232, 240);
        pdf.setFillColor(248, 250, 252);
        pdf.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');
        
        pdf.setFontSize(8);
        pdf.setTextColor(100, 116, 139);
        pdf.text(metric.label, x + 3, y + 5);
        
        pdf.setFontSize(16);
        pdf.setTextColor(metric.color[0], metric.color[1], metric.color[2]);
        pdf.setFont(undefined, 'bold');
        pdf.text(metric.value, x + 3, y + 14);
        pdf.setFont(undefined, 'normal');
      });

      yPosition += 2 * (cardHeight + 3) + 10;

      // Capture Equity Curve Chart
      const chartElement = document.querySelector('.recharts-wrapper');
      if (chartElement) {
        checkPageBreak(80);
        
        pdf.setFontSize(12);
        pdf.setTextColor(15, 23, 42);
        pdf.setFont(undefined, 'bold');
        pdf.text('Equity Curve', margin, yPosition);
        yPosition += 5;

        const canvas = await html2canvas(chartElement as HTMLElement, {
          backgroundColor: '#ffffff',
          scale: 2,
        });
        
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = pageWidth - 2 * margin;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', margin, yPosition, imgWidth, imgHeight);
        yPosition += imgHeight + 10;
      }

      // Page 2: Detailed Statistics
      checkPageBreak(80);
      
      pdf.setFontSize(14);
      pdf.setTextColor(15, 23, 42);
      pdf.setFont(undefined, 'bold');
      pdf.text('Detailed Statistics', margin, yPosition);
      yPosition += 8;

      const stats = [
        ['Total Trades', results.total_trades],
        ['Winning Trades', results.winning_trades],
        ['Losing Trades', results.losing_trades],
        ['Average Win', `$${results.avg_win?.toFixed(2) || '0'}`],
        ['Average Loss', `$${results.avg_loss?.toFixed(2) || '0'}`],
        ['Final Balance', `$${results.final_balance.toFixed(2)}`],
      ];

      pdf.setFontSize(9);
      stats.forEach((stat, index) => {
        const row = Math.floor(index / 2);
        const col = index % 2;
        const x = margin + col * (cardWidth + 3);
        const y = yPosition + row * 10;

        pdf.setTextColor(100, 116, 139);
        pdf.text(stat[0] + ':', x, y);
        pdf.setTextColor(15, 23, 42);
        pdf.setFont(undefined, 'bold');
        pdf.text(String(stat[1]), x + 40, y);
        pdf.setFont(undefined, 'normal');
      });

      yPosition += Math.ceil(stats.length / 2) * 10 + 10;

      // Configuration Used
      checkPageBreak(50);
      
      pdf.setFontSize(12);
      pdf.setTextColor(15, 23, 42);
      pdf.setFont(undefined, 'bold');
      pdf.text('Configuration', margin, yPosition);
      yPosition += 8;

      pdf.setDrawColor(226, 232, 240);
      pdf.setFillColor(248, 250, 252);
      pdf.roundedRect(margin, yPosition, pageWidth - 2 * margin, 35, 2, 2, 'FD');
      yPosition += 6;

      pdf.setFontSize(9);
      pdf.setTextColor(15, 23, 42);
      pdf.setFont(undefined, 'normal');
      
      const configItems = [
        `Initial Balance: $${config.initialBalance}`,
        `Product Type: ${config.productType.toUpperCase()}`,
        config.productType === 'futures' ? `Leverage: ${config.leverage}x` : null,
        `Stop Loss: ${config.stopLossPercent}%`,
        `Take Profit: ${config.takeProfitPercent}%`,
        `Execution Timing: ${config.executionTiming}`,
        `Maker Fee: ${config.makerFee}%`,
        `Taker Fee: ${config.takerFee}%`,
        `Slippage: ${config.slippage}%`,
      ].filter(Boolean);

      configItems.forEach((item, index) => {
        pdf.text(item!, margin + 5, yPosition + index * 5);
      });

      yPosition += configItems.length * 5 + 10;

      // Trade Log
      if (results.trades && results.trades.length > 0) {
        pdf.addPage();
        yPosition = margin;

        pdf.setFontSize(14);
        pdf.setTextColor(15, 23, 42);
        pdf.setFont(undefined, 'bold');
        pdf.text(`Trade Log (${results.trades.length} trades)`, margin, yPosition);
        yPosition += 10;

        pdf.setFontSize(8);
        
        results.trades.forEach((trade: any, index: number) => {
          checkPageBreak(25);

          pdf.setDrawColor(226, 232, 240);
          pdf.setFillColor(248, 250, 252);
          pdf.roundedRect(margin, yPosition, pageWidth - 2 * margin, 22, 2, 2, 'FD');
          
          yPosition += 5;
          
          // Trade type badge
          const badgeColor = trade.type === 'buy' ? [59, 130, 246] : [100, 116, 139];
          pdf.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
          pdf.roundedRect(margin + 3, yPosition - 2, 15, 4, 1, 1, 'F');
          pdf.setTextColor(255, 255, 255);
          pdf.setFont(undefined, 'bold');
          pdf.text(trade.type.toUpperCase(), margin + 4, yPosition + 1.5);
          
          // Profit badge
          if (trade.profit !== undefined) {
            const profitColor = trade.profit >= 0 ? [34, 197, 94] : [239, 68, 68];
            pdf.setFillColor(profitColor[0], profitColor[1], profitColor[2]);
            pdf.roundedRect(margin + 20, yPosition - 2, 20, 4, 1, 1, 'F');
            pdf.setTextColor(255, 255, 255);
            pdf.text(`${trade.profit >= 0 ? '+' : ''}${trade.profit_percent?.toFixed(2)}%`, margin + 21, yPosition + 1.5);
          }
          
          yPosition += 5;
          pdf.setFont(undefined, 'normal');
          pdf.setTextColor(15, 23, 42);
          
          pdf.text(`Entry: $${trade.entry_price.toFixed(2)}`, margin + 3, yPosition);
          if (trade.exit_price) {
            pdf.text(`Exit: $${trade.exit_price.toFixed(2)}`, margin + 50, yPosition);
          }
          
          yPosition += 4;
          pdf.setTextColor(100, 116, 139);
          pdf.text(`Entry: ${new Date(trade.entry_time).toLocaleString()}`, margin + 3, yPosition);
          
          if (trade.exit_time) {
            yPosition += 4;
            pdf.text(`Exit: ${new Date(trade.exit_time).toLocaleString()}`, margin + 3, yPosition);
          }
          
          if (trade.profit !== undefined) {
            yPosition += 4;
            pdf.setTextColor(trade.profit >= 0 ? 34 : 239, trade.profit >= 0 ? 197 : 68, trade.profit >= 0 ? 94 : 68);
            pdf.setFont(undefined, 'bold');
            pdf.text(`P&L: ${trade.profit >= 0 ? '+' : ''}$${trade.profit.toFixed(2)}`, margin + 3, yPosition);
            pdf.setFont(undefined, 'normal');
          }
          
          yPosition += 8;
        });
      }

      // Footer on last page
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(
        `Backtest Report - ${strategyName} - Generated ${new Date().toLocaleDateString()}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );

      // Save PDF
      pdf.save(`backtest-${strategyName.toLowerCase().replace(/\s+/g, '-')}-${new Date().getTime()}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      onClick={exportToPDF}
      disabled={isExporting}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      {isExporting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Exporting...
        </>
      ) : (
        <>
          <FileDown className="h-4 w-4" />
          Export PDF
        </>
      )}
    </Button>
  );
}
