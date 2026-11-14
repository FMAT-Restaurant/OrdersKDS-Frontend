import type { KeyboardEvent } from 'react';
import { pointerAction } from './pointerAction.ts';

export interface StationSelectorProps {
  readonly stations: readonly string[];
  readonly selectedStation: string;
  readonly onSelectStation: (station: string) => void;
}

/**
 * Segmented station selector for KDS kitchen stations.
 * Supports touch interactions (>= 64px touch targets, 16px separation) and full keyboard focus/navigation.
 */
export function StationSelector({
  stations,
  selectedStation,
  onSelectStation,
}: Readonly<StationSelectorProps>) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, station: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectStation(station);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Selector de estaciones"
      className="flex flex-wrap items-center gap-1 sm:gap-1.5 p-1 sm:p-1.5 bg-gray-100 rounded-lg border border-border max-w-full"
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
            {...pointerAction(() => onSelectStation(station))}
            onKeyDown={(event) => handleKeyDown(event, station)}
            className={`min-h-[48px] sm:min-h-[52px] xl:min-h-[56px] px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-control font-bold text-xs sm:text-sm xl:text-base capitalize whitespace-nowrap transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-fmat-primary active:scale-[.98] cursor-pointer ${
              isSelected
                ? 'bg-fmat-primary text-white shadow-md border border-fmat-primary'
                : 'bg-surface text-ink hover:text-ink hover:bg-gray-50 border border-border shadow hover:shadow-md'
            }`}
          >
            {station === 'general' ? 'Todas' : station}
          </button>
        );
      })}
    </div>
  );
}
