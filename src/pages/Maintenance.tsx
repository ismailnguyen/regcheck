import { Wrench } from "lucide-react";

const Maintenance = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <div className="mb-6 flex items-center justify-center gap-2">
          <img src="/favicon.svg" alt="" aria-hidden="true" className="h-8 w-8" />
          <span className="text-2xl font-bold text-primary">RegCheck</span>
        </div>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Wrench className="h-7 w-7 text-muted-foreground" />
        </div>
        <h1 className="mb-2 text-2xl font-bold">App paused for maintenance</h1>
        <p className="text-muted-foreground">
          This app is paused for now. Please contact your administrator if you need it resumed.
        </p>
      </div>
    </div>
  );
};

export default Maintenance;
