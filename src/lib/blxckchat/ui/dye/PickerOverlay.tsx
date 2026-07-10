import React from "react";
import { Box, Text } from "@sauerapple/dye";
import type { PickerItemDef } from "./dye-types.js";
import { THEME } from "../theme.js";
import { OverlayCenter } from "./OverlayCenter.js";

export interface PickerDisplayState {
  items: PickerItemDef[];
  title?: string;
  selectedIndex: number;
  hideFilter?: boolean;
  statusHeader?: string;
  filterQuery: string;
}

function filterItems(items: PickerItemDef[], query: string): PickerItemDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      (item.description?.toLowerCase().includes(q) ?? false),
  );
}

interface PickerOverlayProps {
  state: PickerDisplayState | null;
  filterFocused?: boolean;
}

const VISIBLE_ITEMS = 10;

/**
 * Resolve which item should appear selected. `state.selectedIndex` is an
 * index into the *filtered* list (keyboard navigation maintains it within
 * 0..filtered.length-1, wrapping). Return the id that should be highlighted,
 * or null if the filtered list is empty / the index is out of range.
 */
function selectedItemId(state: PickerDisplayState): string | null {
  const filtered = filterItems(state.items, state.filterQuery);
  if (state.selectedIndex < 0 || state.selectedIndex >= filtered.length) {
    return null;
  }
  return filtered[state.selectedIndex]?.id ?? null;
}

export const PickerOverlay: React.FC<PickerOverlayProps> = ({
  state,
  filterFocused,
}) => {
  if (!state) return null;

  const label = state.title ?? "picker";
  const filtered = filterItems(state.items, state.filterQuery);
  const hideFilter = state.hideFilter === true;

  // Highlight is identity-based on the filtered list so it survives
  // filtering — selectedIndex moves as a filtered-list position, so we
  // look up the selected item by id rather than comparing raw indices.
  const activeId = selectedItemId(state);

  const scrollOffsetRef = React.useRef(0);
  if (filtered.length <= VISIBLE_ITEMS) {
    scrollOffsetRef.current = 0;
  } else {
    const maxOffset = filtered.length - VISIBLE_ITEMS;
    if (state.selectedIndex < scrollOffsetRef.current) {
      scrollOffsetRef.current = state.selectedIndex;
    } else if (state.selectedIndex >= scrollOffsetRef.current + VISIBLE_ITEMS) {
      scrollOffsetRef.current = state.selectedIndex - VISIBLE_ITEMS + 1;
    }
    scrollOffsetRef.current = Math.max(
      0,
      Math.min(scrollOffsetRef.current, maxOffset),
    );
  }
  const scrollOffset = scrollOffsetRef.current;
  const shownItems = filtered.slice(scrollOffset, scrollOffset + VISIBLE_ITEMS);
  const hasMoreAbove = scrollOffset > 0;
  const hasMoreBelow = scrollOffset + VISIBLE_ITEMS < filtered.length;

  const extraRows = (hasMoreAbove ? 1 : 0) + (hasMoreBelow ? 1 : 0);
  const bodyHeight = Math.min(shownItems.length, VISIBLE_ITEMS) + extraRows;
  const headerHeight = state.statusHeader ? 2 : 0;
  const filterHeight = hideFilter ? 0 : 2;
  const height = 2 + 1 + headerHeight + filterHeight + bodyHeight + 1;

  return (
    <OverlayCenter>
      <Box
        width="78%"
        height={height}
        borderStyle="round"
        borderColor={THEME.pink}
        backgroundColor={THEME.bgElevated}
        flexDirection="column"
      >
        <Text color={THEME.pink}> {label} </Text>
        {state.statusHeader ? (
          <Box height={2} paddingLeft={1} paddingRight={1}>
            <Text color={THEME.textDim}>{state.statusHeader}</Text>
          </Box>
        ) : null}
        {!hideFilter ? (
          <Box height={2} paddingLeft={1} paddingRight={1}>
            <Text color={filterFocused ? THEME.pink : THEME.textMuted}>
              {filterFocused ? `> ${state.filterQuery}█` : "type to filter"}
            </Text>
          </Box>
        ) : null}
        <Box flexGrow={1} flexDirection="column">
          {hasMoreAbove ? <Text color={THEME.textDim}> ▴</Text> : null}
          {shownItems.length === 0 ? (
            <Text color={THEME.textMuted}> No matches</Text>
          ) : (
            shownItems.map((item, vi) => {
              const isSel = item.id === activeId;
              const desc = item.description
                ? item.description.length > 48
                  ? `${item.description.slice(0, 45)}...`
                  : item.description
                : "";
              return (
                <Box
                  key={item.id}
                  width="100%"
                  flexDirection="row"
                  backgroundColor={isSel ? THEME.pink : undefined}
                  paddingLeft={1}
                  height={1}
                >
                  <Text bold color={isSel ? THEME.bg : THEME.text}>
                    {isSel ? "▸ " : "  "}
                    {item.label}
                  </Text>
                  {desc ? (
                    <Text color={isSel ? THEME.bg : THEME.textMuted}>
                      {" "}
                      {desc}
                    </Text>
                  ) : null}
                </Box>
              );
            })
          )}
          {hasMoreBelow ? <Text color={THEME.textDim}> ▾</Text> : null}
        </Box>
        <Box paddingLeft={1} paddingRight={1}>
          <Text color={THEME.textDim}>
            {hideFilter
              ? `↑↓ navigate · Enter select · Esc cancel`
              : `↑↓ · Enter · Tab → filter · Esc`}
          </Text>
        </Box>
      </Box>
    </OverlayCenter>
  );
};
