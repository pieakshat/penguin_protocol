"use client";
import { useEffect, useRef } from "react";
import { createChart, ColorType, AreaSeries } from "lightweight-charts";

export default function BondingCurveChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(255, 255, 255, 0.4)",
        fontFamily: "var(--font-mono)",
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.03)" },
        horzLines: { color: "rgba(255, 255, 255, 0.03)" },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        borderVisible: false,
        timeVisible: true,
      },
      rightPriceScale: {
        borderVisible: false,
      },
      crosshair: {
        vertLine: { color: "#3b82f6", labelBackgroundColor: "#1e3a8a" },
        horzLine: { color: "#3b82f6", labelBackgroundColor: "#1e3a8a" },
      },
      handleScale: false,
      handleScroll: false,
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: "#3b82f6",
      topColor: "rgba(59, 130, 246, 0.3)",
      bottomColor: "rgba(59, 130, 246, 0.0)",
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 3, minMove: 0.001 },
    });

    // Mock Bonding Curve Progression
    const data = [
      { time: '2024-05-01', value: 0.100 },
      { time: '2024-05-02', value: 0.180 },
      { time: '2024-05-03', value: 0.290 },
      { time: '2024-05-04', value: 0.420 },
      { time: '2024-05-05', value: 0.580 },
      { time: '2024-05-06', value: 0.710 },
      { time: '2024-05-07', value: 0.842 },
    ];

    areaSeries.setData(data as any);
    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  return <div ref={chartContainerRef} className="w-full h-full" />;
}