import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { COUNTRIES, USAGES } from "@/types";
import type { Country, Usage } from "@/types";

interface ScopeBuilderProps {
  scenarioName: string;
  countries: Country[];
  usages: Usage[];
  onScenarioNameChange: (name: string) => void;
  onCountriesChange: (countries: Country[]) => void;
  onUsagesChange: (usages: Usage[]) => void;
}

export function ScopeBuilder({
  scenarioName,
  countries,
  usages,
  onScenarioNameChange,
  onCountriesChange,
  onUsagesChange,
}: ScopeBuilderProps) {
  const [countriesOpen, setCountriesOpen] = useState(false);
  const [usagesOpen, setUsagesOpen] = useState(false);

  const toggleCountry = (country: Country) => {
    const newCountries = countries.includes(country)
      ? countries.filter(c => c !== country)
      : [...countries, country];
    onCountriesChange(newCountries);
  };

  const toggleUsage = (usage: Usage) => {
    const newUsages = usages.includes(usage)
      ? usages.filter(u => u !== usage)
      : [...usages, usage];
    onUsagesChange(newUsages);
  };

  const removeCountry = (country: Country) => {
    onCountriesChange(countries.filter(c => c !== country));
  };

  const removeUsage = (usage: Usage) => {
    onUsagesChange(usages.filter(u => u !== usage));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Validation Scope</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="scenario-name">Scenario Name (Optional)</Label>
          <Input
            id="scenario-name"
            placeholder="Enter scenario name..."
            value={scenarioName}
            onChange={(e) => onScenarioNameChange(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <Label>Countries *</Label>
          <Popover open={countriesOpen} onOpenChange={setCountriesOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={countriesOpen}
                className="w-full justify-between"
              >
                {countries.length > 0 ? `${countries.length} selected` : "Select countries..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0">
              <Command>
                <CommandInput placeholder="Search countries..." />
                <CommandEmpty>No countries found.</CommandEmpty>
                <CommandGroup className="max-h-64 overflow-auto">
                  {COUNTRIES.map((country) => (
                    <CommandItem
                      key={country}
                      onSelect={() => toggleCountry(country)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          countries.includes(country) ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {country}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
          
          {countries.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {countries.map((country) => (
                <Badge key={country} variant="secondary" className="pr-1">
                  {country}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-1 h-auto p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => removeCountry(country)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          )}
          {countries.length === 0 && (
            <p className="text-sm text-destructive">At least one country is required</p>
          )}
        </div>

        <div className="space-y-3">
          <Label>Usages *</Label>
          <Popover open={usagesOpen} onOpenChange={setUsagesOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={usagesOpen}
                className="w-full justify-between"
              >
                {usages.length > 0 ? `${usages.length} selected` : "Select usages..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0">
              <Command>
                <CommandInput placeholder="Search usages..." />
                <CommandEmpty>No usages found.</CommandEmpty>
                <CommandGroup className="max-h-64 overflow-auto">
                  {USAGES.map((usage) => (
                    <CommandItem
                      key={usage}
                      onSelect={() => toggleUsage(usage)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          usages.includes(usage) ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {usage}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
          
          {usages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {usages.map((usage) => (
                <Badge key={usage} variant="secondary" className="pr-1">
                  {usage}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-1 h-auto p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => removeUsage(usage)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          )}
          {usages.length === 0 && (
            <p className="text-sm text-destructive">At least one usage is required</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}