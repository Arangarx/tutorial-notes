import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type GalleryConfidence = "isolated" | "composed" | "live-route-only";

const CONFIDENCE_LABEL: Record<GalleryConfidence, string> = {
  isolated: "isolated",
  composed: "composed",
  "live-route-only": "live-route-only",
};

type GallerySpecimenProps = {
  name: string;
  canonicalPath: string;
  confidence: GalleryConfidence;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
};

export function GallerySpecimen({
  name,
  canonicalPath,
  confidence,
  children,
  className,
  "data-testid": dataTestId,
}: GallerySpecimenProps) {
  return (
    <Card data-testid={dataTestId} className={cn("gap-4 py-4", className)}>
      <CardHeader className="px-4 pb-0">
        <CardTitle className="text-base font-semibold">{name}</CardTitle>
        <CardDescription className="font-mono text-xs">{canonicalPath}</CardDescription>
        <CardAction>
          <Badge variant="outline">{CONFIDENCE_LABEL[confidence]}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="px-4 pt-0">{children}</CardContent>
    </Card>
  );
}
