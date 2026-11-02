import React, { useState } from 'react';
import { Info, Lock } from 'lucide-react';
import { TaskProgressInfo, TaskStatus } from '../types';

interface TaskProgressBarProps {
  progress: number;
  status: TaskStatus;
  progressInfo?: TaskProgressInfo;
  onSliderChange?: (value: number) => void;
  isUpdating?: boolean;
}

export function TaskProgressBar({
  progress = 0,
  status,
  progressInfo,
  onSliderChange,
  isUpdating = false,
}: TaskProgressBarProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [sliderVal, setSliderVal] = useState(progress);

  // Sync internal slider value if props change
  React.useEffect(() => {
    setSliderVal(progress);
  }, [progress]);

  // CANCELLED status hides or grays out progress bar
  if (status === 'CANCELLED') {
    return (
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-xl w-fit">
        <span>Progress N/A (Cancelled)</span>
      </div>
    );
  }

  const tier = progressInfo?.tier || 2;
  const sourceText = progressInfo?.source_text || 'status derived';
  const canEditSlider = Boolean(progressInfo?.can_edit_slider && onSliderChange);
  const sliderTooltip = progressInfo?.slider_tooltip || 'Progress percentage';

  // Format headline e.g. "45% · 3 of 7 checklist items"
  const formattedLabel = `${progress}% · ${sourceText}`;

  const handleSliderRelease = () => {
    if (canEditSlider && onSliderChange && sliderVal !== progress) {
      onSliderChange(sliderVal);
    }
  };

  return (
    <div className="space-y-2 bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 relative">
          <span className="text-xs font-extrabold text-slate-900 tracking-tight">
            Completion Progress
          </span>
          <div className="relative flex items-center">
            <button
              type="button"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              onClick={() => setShowTooltip(!showTooltip)}
              className="text-slate-400 hover:text-indigo-600 transition-colors p-0.5"
              title="Calculation Details"
            >
              <Info size={14} />
            </button>

            {/* Tooltip Popup */}
            {showTooltip && (
              <div className="absolute left-6 top-0 z-30 w-64 bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1 animate-in fade-in zoom-in-95 duration-150">
                <p className="font-bold text-indigo-300">
                  {tier === 1 && 'Tier 1: Checklist Calculated'}
                  {tier === 2 && 'Tier 2: Status / Manual Override'}
                  {tier === 3 && 'Tier 3: Delegated Subtasks Weighted Average'}
                </p>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  {tier === 1 &&
                    'Progress is calculated objectively based on completed checklist items.'}
                  {tier === 2 &&
                    'Progress auto-sets on status changes (e.g. In Progress = 25%, Submitted = 90%, Completed = 100%). You can drag the slider between 1-99% while In Progress.'}
                  {tier === 3 &&
                    'Progress is the weighted average of all subtasks (weighted by estimated hours). Cannot be manually edited.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Source Text & Percentage */}
        <div className="flex items-center gap-1.5">
          {!canEditSlider && (
            <Lock size={12} className="text-slate-400" title={sliderTooltip} />
          )}
          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-100 font-mono">
            {formattedLabel}
          </span>
        </div>
      </div>

      {/* Progress Bar Visual */}
      <div className="relative w-full bg-slate-200/80 h-3 rounded-full overflow-hidden shadow-inner">
        <div
          className={`h-full transition-all duration-300 rounded-full ${
            progress === 100
              ? 'bg-emerald-500'
              : progress > 50
              ? 'bg-indigo-600'
              : 'bg-indigo-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Interactive Slider for Tier 2 Leaf Tasks in IN_PROGRESS */}
      {canEditSlider ? (
        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span>Manual Slider (1% - 99%)</span>
            <span className="font-mono text-indigo-600 font-bold">{sliderVal}%</span>
          </div>
          <input
            type="range"
            min={1}
            max={99}
            value={sliderVal}
            disabled={isUpdating}
            onChange={(e) => setSliderVal(Number(e.target.value))}
            onMouseUp={handleSliderRelease}
            onTouchEnd={handleSliderRelease}
            className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg appearance-none"
          />
        </div>
      ) : (
        <p className="text-[10px] text-slate-400 font-medium italic pt-0.5">
          {sliderTooltip}
        </p>
      )}
    </div>
  );
}
