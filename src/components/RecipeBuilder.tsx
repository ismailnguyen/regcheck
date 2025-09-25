import { useMemo, useState } from "react";
import { Plus, Trash2, Copy, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getStoredIngredients } from "@/lib/storage";
import { ID_TYPES } from "@/types";
import type { RecipeIngredientInput, IdType } from "@/types";

interface RecipeBuilderProps {
  ingredients: RecipeIngredientInput[];
  recipeSpec: string;
  onRecipeSpecChange: (spec: string) => void;
  onIngredientsChange: (ingredients: RecipeIngredientInput[]) => void;
}

export function RecipeBuilder({ ingredients, recipeSpec, onRecipeSpecChange, onIngredientsChange }: RecipeBuilderProps) {
  const [autoCompleteOpen, setAutoCompleteOpen] = useState<string | null>(null);
  const storedIngredients = getStoredIngredients();

  const totalPercentage = useMemo(() => (
    ingredients.reduce((total, ing) => total + (Number.isFinite(ing.percentage) ? ing.percentage : 0), 0)
  ), [ingredients]);

  const addIngredient = () => {
    const newIngredient: RecipeIngredientInput = {
      id: crypto.randomUUID(),
      name: "",
      idType: "Decernis ID",
      idValue: "",
      percentage: 0,
      function: "",
      spec: "",
    };
    onIngredientsChange([...ingredients, newIngredient]);
  };

  const updateIngredient = <K extends keyof RecipeIngredientInput,>(id: string, field: K, value: RecipeIngredientInput[K]) => {
    const updated = ingredients.map(ingredient =>
      ingredient.id === id ? { ...ingredient, [field]: value } : ingredient
    );
    onIngredientsChange(updated);
  };

  const selectStoredIngredient = (id: string, stored: { name: string; idType: IdType; idValue: string }) => {
    const updated = ingredients.map(ingredient =>
      ingredient.id === id ? {
        ...ingredient,
        name: stored.name,
        idType: stored.idType,
        idValue: stored.idValue,
        spec: ingredient.spec || stored.name,
      } : ingredient
    );
    onIngredientsChange(updated);
    setAutoCompleteOpen(null);
  };

  const duplicateIngredient = (id: string) => {
    const original = ingredients.find(ing => ing.id === id);
    if (original) {
      const duplicate: RecipeIngredientInput = {
        ...original,
        id: crypto.randomUUID(),
        name: `${original.name}`,
      };
      onIngredientsChange([...ingredients, duplicate]);
    }
  };

  const removeIngredient = (id: string) => {
    onIngredientsChange(ingredients.filter(ing => ing.id !== id));
  };

  const validateIdValue = (idType: IdType, value: string): boolean => {
    if (!value.trim()) return false;
    if (idType === "INCI name") {
      return value.trim().length > 0;
    }
    return /^[0-9]+$/.test(value.trim());
  };

  const getValidationError = (ingredient: RecipeIngredientInput): string | null => {
    if (!ingredient.name.trim()) return "Name is required";
    if (!ingredient.idValue.trim()) return "ID Value is required";
    if (!validateIdValue(ingredient.idType, ingredient.idValue)) {
      return ingredient.idType === "INCI name"
        ? "INCI name cannot be empty"
        : "ID Value must contain only digits";
    }
    if (!Number.isFinite(ingredient.percentage)) {
      return "Percentage is required";
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Recipe Ingredients</CardTitle>
          <div className="text-sm text-muted-foreground">
            Total: <span className="font-medium">{totalPercentage.toFixed(2)}%</span>
          </div>
        </div>
        <div className="flex flex-col space-y-3">
          <div className="space-y-1">
            <Label htmlFor="recipe-spec">Recipe Specification (optional)</Label>
            <Input
              id="recipe-spec"
              placeholder="Enter recipe specification..."
              value={recipeSpec}
              onChange={(e) => onRecipeSpecChange(e.target.value)}
            />
          </div>
          <div className="flex space-x-2">
            <Button onClick={addIngredient} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Ingredient
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {ingredients.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No ingredients added yet.</p>
            <p className="text-sm">Click "Add Ingredient" to start building your recipe.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Name *</TableHead>
                    <TableHead className="w-40">ID Type</TableHead>
                    <TableHead className="w-32">ID Value *</TableHead>
                    <TableHead className="w-32">Percentage *</TableHead>
                    <TableHead className="w-32">Function</TableHead>
                    <TableHead className="w-32">Spec</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ingredients.map((ingredient, index) => {
                    const error = getValidationError(ingredient);
                    const percentageError = !Number.isFinite(ingredient.percentage);
                    return (
                      <TableRow key={ingredient.id} className={error ? "border-l-2 border-l-destructive" : ""}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell>
                          <Popover
                            open={autoCompleteOpen === ingredient.id}
                            onOpenChange={(open) => setAutoCompleteOpen(open ? ingredient.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <div className="relative">
                                <Input
                                  value={ingredient.name}
                                  onChange={(e) => updateIngredient(ingredient.id, "name", e.target.value)}
                                  placeholder="Enter ingredient name..."
                                  className={error?.includes("Name") ? "border-destructive pr-8" : "pr-8"}
                                />
                                {storedIngredients.length > 0 && (
                                  <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                )}
                              </div>
                            </PopoverTrigger>
                            {storedIngredients.length > 0 && (
                              <PopoverContent className="p-0 w-80" align="start">
                                <Command>
                                  <CommandInput placeholder="Search saved ingredients..." />
                                  <CommandList>
                                    <CommandEmpty>No stored ingredients found.</CommandEmpty>
                                    <CommandGroup>
                                      {storedIngredients
                                        .filter(stored =>
                                          ingredient.name === "" ||
                                          stored.name.toLowerCase().includes(ingredient.name.toLowerCase())
                                        )
                                        .map((stored, storedIndex) => (
                                          <CommandItem
                                            key={storedIndex}
                                            onSelect={() => selectStoredIngredient(ingredient.id, stored)}
                                            className="cursor-pointer"
                                          >
                                            <div className="flex flex-col">
                                              <span className="font-medium">{stored.name}</span>
                                              <span className="text-sm text-muted-foreground">{stored.idType}: {stored.idValue}</span>
                                            </div>
                                          </CommandItem>
                                        ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            )}
                          </Popover>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={ingredient.idType}
                            onValueChange={(value: IdType) => updateIngredient(ingredient.id, "idType", value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ID_TYPES.map(type => (
                                <SelectItem key={type} value={type}>
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            value={ingredient.idValue}
                            onChange={(e) => updateIngredient(ingredient.id, "idValue", e.target.value)}
                            placeholder={ingredient.idType === "INCI name" ? "Name..." : "123456"}
                            className={error?.includes("ID Value") ? "border-destructive" : ""}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={Number.isFinite(ingredient.percentage) ? ingredient.percentage : ""}
                            onChange={(e) => updateIngredient(ingredient.id, "percentage", Number.parseFloat(e.target.value) || 0)}
                            className={percentageError ? "border-destructive" : ""}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={ingredient.function || ""}
                            onChange={(e) => updateIngredient(ingredient.id, "function", e.target.value)}
                            placeholder="e.g. Fragrance"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={ingredient.spec || ""}
                            onChange={(e) => updateIngredient(ingredient.id, "spec", e.target.value)}
                            placeholder="Enter specification..."
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => duplicateIngredient(ingredient.id)}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeIngredient(ingredient.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {ingredients.some(ing => getValidationError(ing)) && (
              <div className="text-sm text-destructive">
                <p className="font-medium">Please fix the following issues:</p>
                <ul className="list-disc list-inside mt-1">
                  {ingredients.map((ing, idx) => {
                    const error = getValidationError(ing);
                    return error ? <li key={ing.id}>Row {idx + 1}: {error}</li> : null;
                  })}
                </ul>
              </div>
            )}

            {ingredients.length >= 3 && (
              <div className="flex justify-end">
                <Button onClick={addIngredient} size="sm" variant="outline" className="mt-2">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Ingredient
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
