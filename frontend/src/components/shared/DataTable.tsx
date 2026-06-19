"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface DataTableProps<T> {
  columns: {
    header: string;
    accessorKey: keyof T;
    cell?: (row: T) => React.ReactNode;
  }[];
  data: T[];
  className?: string;
}

export function DataTable<T>({ columns, data, className }: DataTableProps<T>) {
  return (
    <div className={cn("rounded-md border border-border", className)}>
      <Table>
        <TableHeader className="bg-white/5">
          <TableRow>
            {columns.map((col, idx) => (
              <TableHead key={idx} className="text-[10px] font-bold uppercase tracking-widest">
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length > 0 ? (
            data.map((row, rowIdx) => (
              <TableRow key={rowIdx} className="hover:bg-white/5 transition-colors border-border">
                {columns.map((col, colIdx) => (
                  <TableCell key={colIdx} className="text-sm py-4">
                    {col.cell ? col.cell(row) : (row[col.accessorKey] as React.ReactNode)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground italic">
                No records in current view.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
