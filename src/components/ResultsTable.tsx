import { useState, useMemo, useCallback } from "react";
import { ArrowUpDown, ExternalLink, FileDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReportRow, ResultSummary } from "@/types";
import { utils as XLSXUtils, writeFile as writeXLSXFile } from "xlsx";

interface ResultsTableProps {
  data: ReportRow[];
  summary?: ResultSummary;
  isLoading?: boolean;
  title?: string;
  showPercentage?: boolean;
}

type SortField = keyof ReportRow;
type SortDirection = 'asc' | 'desc' | null;

interface ColumnDefinition {
  key: keyof ReportRow;
  label: string;
  filterable: boolean;
  cellClassName?: string;
}

const BASE_TABLE_COLUMNS: ColumnDefinition[] = [
  { key: 'customerName', label: 'Ingredient Name', filterable: true },
  { key: 'spec', label: 'Spec', filterable: true },
  { key: 'country', label: 'Country', filterable: true },
  { key: 'usage', label: 'Usage', filterable: true },
  { key: 'resultIndicator', label: 'Restriction Result', filterable: true },
  { key: 'threshold', label: 'Restriction Level', filterable: true },
  { key: 'regulation', label: 'Regulation', filterable: true },
  { key: 'citation', label: 'Legal Quote', filterable: true, cellClassName: 'max-w-xs truncate' },
  { key: 'idType', label: 'ID Type', filterable: true },
  { key: 'idValue', label: 'ID Value', filterable: true },
  { key: 'decernisName', label: 'Decernis Name', filterable: true },
  { key: 'function', label: 'Function', filterable: true },
];

const PERCENTAGE_COLUMN: ColumnDefinition = {
  key: 'percentage',
  label: 'Percentage',
  filterable: false,
};

const pickFirstValue = (...values: Array<unknown>): string | null => {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toString();
    }
  }
  return null;
};

const resolveIngredientName = (row: ReportRow): string => {
  const rowWithOptionalName = row as ReportRow & { name?: string | null };
  return (
    pickFirstValue(
      rowWithOptionalName.name,
      row.customerName,
      row.decernisName,
      row.customerId,
      row.idValue,
    ) ?? ''
  );
};

const getFilterableTextValue = (row: ReportRow, columnKey: keyof ReportRow): string => {
  if (columnKey === 'customerName') {
    return resolveIngredientName(row);
  }

  const rawValue = row[columnKey];
  if (rawValue === undefined || rawValue === null) {
    return '';
  }

  if (typeof rawValue === 'string') {
    return rawValue;
  }

  if (typeof rawValue === 'number') {
    return Number.isFinite(rawValue) ? rawValue.toString() : '';
  }

  return String(rawValue);
};

export function ResultsTable({ data, summary, isLoading, title, showPercentage }: ResultsTableProps) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [pageSize, setPageSize] = useState<number | 'all'>(50);
  const [currentPage, setCurrentPage] = useState(1);

  const columns = useMemo(() => {
    const base = [...BASE_TABLE_COLUMNS];
    if (showPercentage) {
      base.splice(0, 0, PERCENTAGE_COLUMN);
    }
    return base;
  }, [showPercentage]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : sortDirection === 'desc' ? null : 'asc');
      if (sortDirection === 'desc') {
        setSortField(null);
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const handleFilter = (column: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [column]: value
    }));
    setCurrentPage(1);
  };

  const filteredAndSortedData = useMemo(() => {
    const visibleColumnKeys = new Set(columns.map(column => column.key));

    const filtered = data.filter(row => {
      return Object.entries(filters).every(([columnKey, filterValue]) => {
        if (!filterValue) {
          return true;
        }

        const normalizedFilterValue = filterValue.trim().toLowerCase();
        if (!normalizedFilterValue) {
          return true;
        }

        if (!visibleColumnKeys.has(columnKey as keyof ReportRow)) {
          return true;
        }

        const candidateValue = getFilterableTextValue(row, columnKey as keyof ReportRow).toLowerCase();
        return candidateValue.includes(normalizedFilterValue);
      });
    });

    if (sortField && sortDirection) {
      filtered.sort((a, b) => {
        const aVal = String(a[sortField] || '');
        const bVal = String(b[sortField] || '');
        const comparison = aVal.localeCompare(bVal, undefined, { numeric: true });
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return filtered;
  }, [columns, data, filters, sortField, sortDirection]);

  const filterSuggestions = useMemo(() => {
    const suggestions: Record<string, string[]> = {};
    columns.forEach((column) => {
      if (!column.filterable) {
        return;
      }
      const values = new Set<string>();
      data.forEach((row) => {
        const raw = getFilterableTextValue(row, column.key);
        const normalized = raw.trim();
        if (normalized) {
          values.add(normalized);
        }
      });
      suggestions[column.key] = Array.from(values).sort((a, b) => a.localeCompare(b));
    });
    return suggestions;
  }, [columns, data]);

  const paginatedData = useMemo(() => {
    if (pageSize === 'all') {
      return filteredAndSortedData;
    }
    const startIndex = (currentPage - 1) * pageSize;
    return filteredAndSortedData.slice(startIndex, startIndex + pageSize);
  }, [filteredAndSortedData, currentPage, pageSize]);

  const totalPages = pageSize === 'all'
    ? 1
    : Math.max(1, Math.ceil(filteredAndSortedData.length / pageSize));

  const resultsCountLabel = `Results (${filteredAndSortedData.length} total)`;

  const renderTitleBlock = (showCount: boolean) => {
    const heading = title ?? (showCount ? resultsCountLabel : 'Results');
    const description = title ? (showCount ? resultsCountLabel : 'Results') : undefined;

    return (
      <div className="space-y-1">
        <CardTitle>{heading}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </div>
    );
  };

  const getStatusBadge = (indicator: string) => {
    const status = indicator.toUpperCase();
    const variants = {
      'ALLOWED': 'default',
      'PERMITTED': 'default',
      'LISTED': 'secondary',
      'PROHIBITED': 'destructive',
      'RESTRICTED': 'outline',
    } as const;
    
    return (
      <Badge variant={variants[status as keyof typeof variants] || 'outline'}>
        {status}
      </Badge>
    );
  };

  const formatTextValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '–';
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed || '–';
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value.toString() : '–';
    }
    return String(value);
  };

  const toTrimmedNumberString = (num: number): string => {
    if (!Number.isFinite(num)) {
      return '';
    }
    return Number(num.toFixed(4)).toString();
  };

const formatPercentageValue = (value: ReportRow['percentage']): string => {
    if (value === null || value === undefined) {
      return '–';
    }

    if (typeof value === 'number') {
      return Number.isFinite(value) ? `${toTrimmedNumberString(value)}%` : '–';
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return '–';
      }
      if (trimmed.includes('%')) {
        return trimmed;
      }
      const numeric = Number(trimmed);
      if (!Number.isNaN(numeric)) {
        return `${toTrimmedNumberString(numeric)}%`;
      }
      return trimmed;
    }

    return '–';
  };

  const renderCellContent = (columnKey: keyof ReportRow, row: ReportRow) => {
    if (columnKey === 'customerName') {
      const resolvedName = resolveIngredientName(row);
      return resolvedName || '–';
    }

    if (columnKey === 'resultIndicator') {
      return getStatusBadge(row.resultIndicator);
    }

    if (columnKey === 'percentage') {
      return formatPercentageValue(row.percentage);
    }

    return formatTextValue(row[columnKey]);
  };

  const formatValueForExport = (columnKey: keyof ReportRow, row: ReportRow): string => {
    if (columnKey === 'customerName') {
      return resolveIngredientName(row);
    }

    if (columnKey === 'resultIndicator') {
      return row.resultIndicator?.toUpperCase?.() ?? '';
    }

    if (columnKey === 'percentage') {
      const value = row.percentage;
      if (value === null || value === undefined) {
        return '';
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return toTrimmedNumberString(value);
      }
      if (typeof value === 'string') {
        return value.trim();
      }
      return String(value);
    }

    const raw = row[columnKey];
    if (raw === null || raw === undefined) {
      return '';
    }
    if (typeof raw === 'string') {
      return raw.trim();
    }
    if (typeof raw === 'number') {
      return Number.isFinite(raw) ? raw.toString() : '';
    }
    return String(raw);
  };

  const exportRows = useMemo(() => {
    return filteredAndSortedData.map((row) => {
      const entry: Record<string, string> = {};
      columns.forEach((column) => {
        entry[column.label] = formatValueForExport(column.key, row);
      });
      entry.Link = row.hyperlink?.toString() ?? '';
      return entry;
    });
  }, [columns, filteredAndSortedData]);

  const handleExport = useCallback(() => {
    if (exportRows.length === 0 || typeof window === 'undefined') {
      return;
    }

    const worksheet = XLSXUtils.json_to_sheet(exportRows);
    const workbook = XLSXUtils.book_new();
    XLSXUtils.book_append_sheet(workbook, worksheet, 'Results');

    const baseNameRaw = title?.trim() || 'regcheck-results';
    const sanitizedBaseName = baseNameRaw.replace(/[\\/:*?"<>|]+/g, '-');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${sanitizedBaseName}-${timestamp}.xlsx`;

    writeXLSXFile(workbook, filename);
  }, [exportRows, title]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          {renderTitleBlock(false)}
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Running validation...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          {renderTitleBlock(false)}
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <p>No results to display.</p>
            <p className="text-sm">Run a validation to see results here.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handlePageSizeChange = (value: string) => {
    if (value === 'all') {
      setPageSize('all');
      setCurrentPage(1);
      return;
    }

    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) {
      setPageSize(numeric);
      setCurrentPage(1);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          {renderTitleBlock(true)}
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            {summary && (
              <div className="flex flex-wrap gap-2 sm:justify-end">
                {Object.entries(summary.countsByIndicator).map(([status, count]) => (
                  <Badge key={status} variant="outline" className="text-xs">
                    {status}: {count}
                  </Badge>
                ))}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exportRows.length === 0}
              className="border-[#1e5d3a] bg-[#217346] text-white hover:bg-[#1e5d3a]"
            >
              <FileDown className="mr-2 h-4 w-4" />
              Export to Excel
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map(column => (
                    <TableHead key={column.key} className="relative">
                      <div className="space-y-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto p-0 font-semibold hover:bg-transparent"
                          onClick={() => handleSort(column.key as SortField)}
                        >
                          {column.label}
                          <ArrowUpDown className="ml-2 h-3 w-3" />
                        </Button>
                        {column.filterable && (
                          <Input
                            placeholder={`Filter ${column.label.toLowerCase()}...`}
                            value={filters[column.key] || ''}
                            onChange={(e) => handleFilter(column.key, e.target.value)}
                            list={`filter-${column.key}`}
                            className="h-8 text-xs"
                          />
                        )}
                        {column.filterable && filterSuggestions[column.key]?.length > 0 && (
                          <datalist id={`filter-${column.key}`}>
                            {filterSuggestions[column.key].map((option) => (
                              <option key={option} value={option} />
                            ))}
                          </datalist>
                        )}
                      </div>
                    </TableHead>
                  ))}
                  <TableHead>Link</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.map((row, index) => {
                  return (
                    <TableRow key={`${row.customerId}-${row.country}-${row.usage}-${index}`}>
                      {columns.map((column) => {
                        const derivedClassName = [
                          column.cellClassName,
                          column.key === 'customerName' ? 'font-medium' : null,
                        ].filter(Boolean).join(' ');

                        const cellProps: {
                          className?: string;
                          title?: string;
                        } = {};

                        if (derivedClassName) {
                          cellProps.className = derivedClassName;
                        }

                        if (column.key === 'citation' && typeof row.citation === 'string' && row.citation.trim()) {
                          cellProps.title = row.citation;
                        }

                        return (
                          <TableCell key={column.key} {...cellProps}>
                            {renderCellContent(column.key, row)}
                          </TableCell>
                        );
                      })}
                      <TableCell>
                        {row.hyperlink && (
                          <Button variant="ghost" size="sm" asChild>
                            <a href={row.hyperlink} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <div className="flex items-center space-x-2">
              <span>Rows per page:</span>
              <Select value={pageSize === 'all' ? 'all' : String(pageSize)} onValueChange={handlePageSizeChange}>
                <SelectTrigger className="h-8 w-[132px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map(size => (
                    <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                  ))}
                  <SelectItem value="all">Show all</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:space-x-3">
              <span>
                Showing {paginatedData.length} of {filteredAndSortedData.length}
              </span>
              {pageSize !== 'all' && (
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span>Page {currentPage} of {totalPages}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
