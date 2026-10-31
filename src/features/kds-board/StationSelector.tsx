import type { KeyboardEvent } from 'react';

export interface StationSelectorProps {
  stations: string[];
  selectedStation: string;
  onSelectStation: (station: string) => void;
}

/**
 * Segmented station selector for KDS kitchen stations.
 * Supports touch interactions (>= 48px touch targets) and full keyboard focus/navigation.
 */
export function StationSelector({
  stations,
  selectedStation,
  onSelectStation,
}: StationSelectorProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, station: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectStation(station);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Station selector"
      className="flex items-center gap-2 p-1.5 bg-gray-950/90 rounded-lg border border-gray-800"
    >
      {stations.map((station) => {
        const isSelected = selectedStation.toLowerCase() === station.toLowerCase();
        return (
          <button
            key={station}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={0}
            data-testid={`station-tab-${station.toLowerCase()}`}
            onClick={() => onSelectStation(station)}
            onKeyDown={(event) => handleKeyDown(event, station)}
            className={`min-h-[48px] px-5 py-2.5 rounded-md font-bold text-base capitalize transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-fmat-primary ${
              isSelected
                ? 'bg-fmat-secondary text-white shadow-md'
                : 'text-gray-300 hover:text-white hover:bg-gray-800'
            }`}
          >
            {station}
          </button>
        );
      })}
    </div>
  );
}

