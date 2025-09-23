import { useState } from "react";
import { Plus, Trash2, Copy, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { getStoredIngredients } from "@/lib/storage";
import { ID_TYPES } from "@/types";
import type { IngredientInput, IdType } from "@/types";

interface IngredientsBuilderProps {
  ingredients: IngredientInput[];
  onIngredientsChange: (ingredients: IngredientInput[]) => void;
}

export function IngredientsBuilder({
  ingredients,
  onIngredientsChange,
}: IngredientsBuilderProps) {
  const [autoCompleteOpen, setAutoCompleteOpen] = useState<string | null>(null);
  const storedIngredients = getStoredIngredients();

  const addIngredient = () => {
    const newIngredient: IngredientInput = {
      id: crypto.randomUUID(),
      name: "",
      idType: "Decernis ID",
      idValue: "",
    };
    onIngredientsChange([...ingredients, newIngredient]);
  };

  const updateIngredient = (id: string, field: keyof IngredientInput, value: string) => {
    const updated = ingredients.map(ingredient =>
      ingredient.id === id ? { ...ingredient, [field]: value } : ingredient
    );
    onIngredientsChange(updated);
  };

  const selectStoredIngredient = (id: string, stored: IngredientInput) => {
    const updated = ingredients.map(ingredient =>
      ingredient.id === id ? { 
        ...ingredient, 
        name: stored.name, 
        idType: stored.idType, 
        idValue: stored.idValue 
      } : ingredient
    );
    onIngredientsChange(updated);
    setAutoCompleteOpen(null);
  };

  const duplicateIngredient = (id: string) => {
    const original = ingredients.find(ing => ing.id === id);
    if (original) {
      const duplicate: IngredientInput = {
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
    
    // For numeric ID types, ensure digits only
    return /^[0-9]+$/.test(value.trim());
  };

  const getValidationError = (ingredient: IngredientInput): string | null => {
    if (!ingredient.name.trim()) return "Name is required";
    if (!ingredient.idValue.trim()) return "ID Value is required";
    if (!validateIdValue(ingredient.idType, ingredient.idValue)) {
      return ingredient.idType === "INCI name" 
        ? "INCI name cannot be empty"
        : "ID Value must contain only digits";
    }
    return null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Ingredients</CardTitle>
        <div className="flex space-x-2">
          <Button onClick={addIngredient} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Ingredient
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {ingredients.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No ingredients added yet.</p>
            <p className="text-sm">Click "Add Ingredient" to get started.</p>
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
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ingredients.map((ingredient, index) => {
                    const error = getValidationError(ingredient);
                    return (
                      <TableRow key={ingredient.id} className={error ? "border-l-2 border-l-destructive" : ""}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell>
                          <Popover open={autoCompleteOpen === ingredient.id} onOpenChange={(open) => setAutoCompleteOpen(open ? ingredient.id : null)}>
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
                                        .map((stored, index) => (
                                          <CommandItem
                                            key={index}
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
            
            {ingredients.length === 0 && (
              <p className="text-sm text-destructive">At least one ingredient is required</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}