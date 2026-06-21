export function PageHeader({
  title,
  count,
  actions,
}: {
  title: string;
  count?: number;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {count != null && (
          <span className="text-sm text-muted-foreground">{count}</span>
        )}
      </div>
      {actions}
    </div>
  );
}
