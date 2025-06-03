'use client';
import { StatCard } from '@/ui/StatCard';
import formatRupioh from '@/utils/formatRupiah';
import React, { useEffect, useState } from 'react';
import { FaArrowDown, FaArrowUp, FaPiggyBank, FaWallet } from 'react-icons/fa';
import {
  fetchMonthlyChart,
  fetchMonthlySummary,
  fetchTodayTransaction,
} from '@/services/transaction';

import { profile as fetchProfile } from '@/services/auth';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ChartPoint, SummaryData, Transaction } from '@/interfaces/IDashboard';
import convertNumRupiah from '@/utils/convertNumRupiah';

const DashboardPage = () => {
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>(
    []
  );
  const [user, setUser] = useState<{ name?: string }>({});

  const pageData = async () => {
    try {
      const [chart, summaryRes, recent, profileRes] = await Promise.all([
        fetchMonthlyChart(),
        fetchMonthlySummary(),
        fetchTodayTransaction(),
        fetchProfile(localStorage.getItem('token') || ''),
      ]);

      setChartData(chart.data);
      setSummary(summaryRes.data);
      setRecentTransactions(recent.data);
      setUser(profileRes.data || {});
    } catch (error) {
      if (error instanceof Error) {
        console.error({ message: error.message, type: 'danger' });
      } else {
        console.error({ message: 'Terjadi kesalahan', type: 'danger' });
      }
    }
  };

  const dateNow = new Date().toLocaleDateString('en-EN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  useEffect(() => {
    pageData();
  }, []);

  return (
    <div className="p-3 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-8 text-white bg-gradient-to-r from-indigo-900 to-indigo-600 p-6 rounded-xl shadow-lg">
        <div className="flex justify-between items-start flex-wrap gap-2">
          <div>
            <h2 className="text-3xl font-semibold">
              Wellcome Back, {user?.name}
            </h2>
            <p className="mt-1 font-normal">
              Insights at a glance: Empowering your financial journey.
            </p>
          </div>
          <div className="text-right text-medium text-white">
            <p className="font-medium">{dateNow}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Balance"
            value={formatRupioh(summary?.balance ?? 0)}
            change="This Month"
            color="text-gray-600"
            icon=<FaWallet size={24} />
          />
          <StatCard
            title="Total Savings"
            value={formatRupioh(summary?.saving ?? 0)}
            change="For Recommendations"
            color="text-gray-600"
            icon=<FaPiggyBank size={24} />
          />
          <StatCard
            title="Total Incomes"
            value={formatRupioh(summary?.income ?? 0)}
            change="This Month"
            color="text-gray-600"
            icon=<FaArrowDown size={24} />
          />
          <StatCard
            title="Total Expenses"
            value={formatRupioh(summary?.expense ?? 0)}
            change="This Month"
            color="text-gray-600"
            icon=<FaArrowUp size={24} />
          />
        </div>
      </div>

      {/* Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 pb-16 rounded-lg shadow lg:col-span-3 h-[61vh]">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold">Money Flow</h3>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis
                dataKey={'date'}
                tickFormatter={(date) => {
                  const day = new Date(date).getDate();
                  return String(day).padStart(2, '0');
                }}
              />
              <YAxis
                tickFormatter={(value) => `${value.toLocaleString('id-ID')}`}
                tick={{ fontSize: 10 }}
              />
              <Tooltip
                formatter={(value) => `${value.toLocaleString('id-ID')}`}
                labelFormatter={(label) => {
                  const d = new Date(label);
                  return `Tanggal ${String(d.getDate()).padStart(
                    2,
                    '0'
                  )} ${d.toLocaleString('id-ID', {
                    month: 'long',
                  })} ${d.getFullYear()}`;
                }}
              />
              <Line
                type={'monotone'}
                dataKey={'income'}
                stroke="#4f46e5"
                strokeWidth={2}
                isAnimationActive={true}
                animationDuration={1200}
              />
              <Line
                type={'monotone'}
                dataKey={'expense'}
                stroke="#dc2626"
                strokeWidth={2}
                isAnimationActive={true}
                animationDuration={1200}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white p-6 rounded-lg overflow-auto h-full">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-md font-bold">Recent Transaction</h3>
          </div>
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="text-gray-500 border-b">
                <th className="py-2">tx</th>
                <th>amount</th>
              </tr>
            </thead>
            <tbody>
              {recentTransactions.map((tx, idx) => {
                const tanggal = new Date(tx.date).toLocaleDateString('id-ID', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                });
                return (
                  <tr key={idx} className="border-t text-gray-600">
                    <td className="py-3 font-medium">
                      <div className="text-sm font-semibold">
                        {tx.category?.name || '-'}
                      </div>
                      <div className="text-xs text-gray-400">{tanggal}</div>
                    </td>
                    <td
                      className={`font-medium ${
                        tx.type === 'expense'
                          ? 'text-red-500'
                          : 'text-green-500'
                      }`}>
                      {tx.type === 'expense' ? '- ' : '+ '}
                      {convertNumRupiah(tx.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
