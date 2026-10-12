"use client";

import { useState } from "react";
import { Pagination } from "@/components/pagination";

export function PaginationDemo() {
  const [page, setPage] = useState(3);
  return (
    <Pagination page={page} pageSize={10} total={128} onPageChange={setPage} entityName="submissions" />
  );
}
