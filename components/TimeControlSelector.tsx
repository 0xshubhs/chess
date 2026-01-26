"use client";

import React from "react";
import { TIME_CONTROLS, TIME_CONTROL_LABELS, GameMode } from "../lib/store";

interface TimeControlSelectorProps {
  selectedTime: string;
  onSelect: (tc: string) => void;
  gameMode: GameMode;
  onGameModeChange: (mode: GameMode) => void;
  disabled?: boolean;
}

const TIME_CONTROL_GROUPS = [
  { label: "Bullet", controls: ["bullet1", "bullet2"] },
  { label: "Blitz", controls: ["blitz3", "blitz3_2", "blitz5", "blitz5_3"] },
  { label: "Rapid", controls: ["rapid10", "rapid15_10"] },
  { label: "Classical", controls: ["classical30", "unlimited"] },
];

export default function TimeControlSelector({
  selectedTime,
  onSelect,
  gameMode,
  onGameModeChange,
  disabled = false,
}: TimeControlSelectorProps) {
  return (
    <div className="bg-[#262626] rounded-lg p-3">
      {/* Game Mode Toggle */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => onGameModeChange("ai")}
          disabled={disabled}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            gameMode === "ai"
              ? "bg-purple-600 text-white"
              : "bg-[#333] text-gray-400 hover:bg-[#3a3a3a] hover:text-gray-300"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          🤖 vs AI
        </button>
        <button
          onClick={() => onGameModeChange("pvp")}
          disabled={disabled}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            gameMode === "pvp"
              ? "bg-blue-600 text-white"
              : "bg-[#333] text-gray-400 hover:bg-[#3a3a3a] hover:text-gray-300"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          👥 Local
        </button>
      </div>

      {/* Time Control Label */}
      <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold block mb-2">
        Time Control
      </span>

      {/* Time Control Grid */}
      <div className="space-y-2">
        {TIME_CONTROL_GROUPS.map((group) => (
          <div key={group.label} className="flex gap-1.5">
            {group.controls.map((tc) => {
              const isSelected = selectedTime === tc;
              const control = TIME_CONTROLS[tc];
              const isUnlimited = control.initial === 0;
              
              return (
                <button
                  key={tc}
                  onClick={() => onSelect(tc)}
                  disabled={disabled}
                  className={`flex-1 px-2 py-1.5 rounded text-xs font-medium transition-all ${
                    isSelected
                      ? isUnlimited
                        ? "bg-gray-600 text-white"
                        : "bg-green-600 text-white"
                      : "bg-[#333] text-gray-400 hover:bg-[#3a3a3a] hover:text-gray-300"
                  } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  title={`${Math.floor(control.initial / 60)} min${control.increment > 0 ? ` + ${control.increment}s` : ""}`}
                >
                  {TIME_CONTROL_LABELS[tc]}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
