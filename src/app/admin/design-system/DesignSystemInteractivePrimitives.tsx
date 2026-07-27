"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function DesignSystemDialogSample() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Open dialog sample
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dialog specimen</DialogTitle>
          <DialogDescription>
            Modal overlay from the shared dialog primitive. Gallery PASS does not prove in-flow
            modal behavior on every surface.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Close with the X control or click outside.
        </p>
      </DialogContent>
    </Dialog>
  );
}

export function DesignSystemSelectSample() {
  return (
    <div className="flex max-w-xs flex-col gap-2">
      <Label htmlFor="gallery-select-demo">Example select</Label>
      <Select defaultValue="option-a">
        <SelectTrigger id="gallery-select-demo" className="w-full">
          <SelectValue placeholder="Choose an option" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="option-a">Option A</SelectItem>
          <SelectItem value="option-b">Option B</SelectItem>
          <SelectItem value="option-c">Option C</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
