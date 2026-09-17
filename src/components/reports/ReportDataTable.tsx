"use client";

import { useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
} from "lucide-react";

type ReportDataTableProps<TData> = {
  data: TData[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<TData, any>[];
  title?: string;
  subtitle?: string;
  searchPlaceholder?: string;
  filterComponent?: ReactNode;
  summaryRow?: ReactNode;
  pageSizeOptions?: number[];
  initialPageSize?: number;
  emptyMessage?: string;
};

export default function ReportDataTable<TData>({
  data,
  columns,
  title,
  subtitle,
  searchPlaceholder = "Search records...",
  filterComponent,
  summaryRow,
  pageSizeOptions = [10, 25, 50, 100],
  initialPageSize = 25,
  emptyMessage = "No records found matching your filters.",
}: ReportDataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: initialPageSize,
  });

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      pagination,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="space-y-4">
      {/* Table Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-surface p-3.5 sm:p-4 rounded-xl border border-border">
        <div>
          {title && (
            <h3 className="text-sm sm:text-base font-bold text-foreground">
              {title}
            </h3>
          )}
          {subtitle && (
            <p className="text-xs text-muted mt-0.5">{subtitle}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {filterComponent}

          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-surface-muted/50 border border-border focus:outline-none focus:border-emerald-500 text-foreground transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-2xs">
        <div className="overflow-x-auto max-h-[600px] scrollbar-thin">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-900/80 text-slate-300 sticky top-0 z-10 border-b border-border backdrop-blur-xs">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const isSortable = header.column.getCanSort();
                    const sortDirection = header.column.getIsSorted();

                    return (
                      <th
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        className={`py-3 px-3.5 font-semibold select-none whitespace-nowrap ${
                          isSortable
                            ? "cursor-pointer hover:text-white transition-colors"
                            : ""
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {isSortable && (
                            <span className="text-slate-400">
                              {sortDirection === "asc" ? (
                                <ArrowUp className="size-3 text-emerald-400" />
                              ) : sortDirection === "desc" ? (
                                <ArrowDown className="size-3 text-emerald-400" />
                              ) : (
                                <ArrowUpDown className="size-3 opacity-40 hover:opacity-100" />
                              )}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border/60">
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="py-12 text-center text-muted text-xs"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-surface-muted/60 transition-colors"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="py-2.5 px-3.5 align-middle">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            {summaryRow && <tfoot>{summaryRow}</tfoot>}
          </table>
        </div>

        {/* Pagination & Row Count Footer */}
        <div className="p-3 sm:p-4 border-t border-border bg-slate-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-muted">
          <div className="flex items-center gap-2">
            <span>
              Showing{" "}
              <span className="font-semibold text-foreground">
                {table.getRowModel().rows.length > 0
                  ? table.getState().pagination.pageIndex *
                      table.getState().pagination.pageSize +
                    1
                  : 0}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-foreground">
                {Math.min(
                  (table.getState().pagination.pageIndex + 1) *
                    table.getState().pagination.pageSize,
                  table.getFilteredRowModel().rows.length,
                )}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-foreground">
                {table.getFilteredRowModel().rows.length}
              </span>{" "}
              entries
            </span>

            <div className="flex items-center gap-1.5 ml-4">
              <span className="text-[11px]">Rows:</span>
              <select
                value={table.getState().pagination.pageSize}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
                className="px-2 py-1 text-xs rounded-lg bg-surface border border-border text-foreground focus:outline-none focus:border-emerald-500"
              >
                {pageSizeOptions.map((sz) => (
                  <option key={sz} value={sz}>
                    {sz}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="p-1.5 rounded-lg border border-border hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="First page"
            >
              <ChevronsLeft className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="p-1.5 rounded-lg border border-border hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Previous page"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="px-2 text-[11px] font-medium text-foreground">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {Math.max(1, table.getPageCount())}
            </span>
            <button
              type="button"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="p-1.5 rounded-lg border border-border hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Next page"
            >
              <ChevronRight className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              className="p-1.5 rounded-lg border border-border hover:bg-surface-muted disabled:opacity-30 disabled:pointer-events-none transition-colors"
              title="Last page"
            >
              <ChevronsRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
