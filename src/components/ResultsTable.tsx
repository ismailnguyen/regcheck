import { useState, useMemo } from "react";
import { ArrowUpDown, ExternalLink, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface ResultsTableProps {
  data: ReportRow[];
  summary?: ResultSummary;
  isLoading?: boolean;
}

type SortField = keyof ReportRow;
type SortDirection = 'asc' | 'desc' | null;

interface ColumnDefinition {
  key: keyof ReportRow;
  label: string;
  filterable: boolean;
}

const TABLE_COLUMNS: ColumnDefinition[] = [
  { key: 'customerName', label: 'Ingredient Name', filterable: true },
  { key: 'country', label: 'Country', filterable: true },
  { key: 'usage', label: 'Usage', filterable: true },
  { key: 'resultIndicator', label: 'Restriction Result', filterable: true },
  { key: 'threshold', label: 'Restriction Level', filterable: true },
  { key: 'regulation', label: 'Regulation', filterable: true },
  { key: 'citation', label: 'Legal Quote', filterable: true },
  { key: 'idType', label: 'ID Type', filterable: true },
  { key: 'idValue', label: 'ID Value', filterable: true },
  { key: 'decernisName', label: 'Decernis Name', filterable: true },
  { key: 'function', label: 'Function', filterable: true },
];

export function ResultsTable({ data, summary, isLoading }: ResultsTableProps) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [pageSize, setPageSize] = useState<number | 'all'>(50);
  const [currentPage, setCurrentPage] = useState(1);

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
    const filtered = data.filter(row => {
      return Object.entries(filters).every(([column, filterValue]) => {
        if (!filterValue) return true;
        const cellValue = String(row[column as keyof ReportRow] || '').toLowerCase();
        return cellValue.includes(filterValue.toLowerCase());
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
  }, [data, filters, sortField, sortDirection]);

  const filterSuggestions = useMemo(() => {
    const suggestions: Record<string, string[]> = {};
    TABLE_COLUMNS.forEach((column) => {
      if (!column.filterable) {
        return;
      }
      const values = new Set<string>();
      data.forEach((row) => {
        const raw = row[column.key as keyof ReportRow];
        if (raw === undefined || raw === null) {
          return;
        }
        const normalized = String(raw).trim();
        if (normalized) {
          values.add(normalized);
        }
      });
      suggestions[column.key] = Array.from(values).sort((a, b) => a.localeCompare(b));
    });
    return suggestions;
  }, [data]);

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

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
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
          <CardTitle>Results</CardTitle>
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
        <CardTitle className="flex items-center justify-between">
          <span>Results ({filteredAndSortedData.length} total)</span>
          {summary && (
            <div className="flex space-x-2">
              {Object.entries(summary.countsByIndicator).map(([status, count]) => (
                <Badge key={status} variant="outline" className="text-xs">
                  {status}: {count}
                </Badge>
              ))}
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {TABLE_COLUMNS.map(column => (
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
                  const ingredientName = row.name || row.spec || row.customerName || '–';
                  return (
                    <TableRow key={`${row.customerId}-${row.country}-${row.usage}-${index}`}>
                      <TableCell className="font-medium">{ingredientName}</TableCell>
                      <TableCell>{row.country || '–'}</TableCell>
                      <TableCell>{row.usage || '–'}</TableCell>
                      <TableCell>{getStatusBadge(row.resultIndicator)}</TableCell>
                      <TableCell>{row.threshold || '–'}</TableCell>
                      <TableCell>{row.regulation || '–'}</TableCell>
                      <TableCell className="max-w-xs truncate" title={row.citation || ''}>{row.citation || '–'}</TableCell>
                      <TableCell>{row.idType || '–'}</TableCell>
                      <TableCell>{row.idValue || '–'}</TableCell>
                      <TableCell>{row.decernisName || '–'}</TableCell>
                      <TableCell>{row.function || '–'}</TableCell>
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
