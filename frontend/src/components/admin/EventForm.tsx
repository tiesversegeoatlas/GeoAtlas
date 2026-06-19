"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldLabel,
  FieldError,
  FieldContent
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CATEGORY_LABELS } from "@/lib/constants";

const eventSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters"),
  summary: z.string().min(10, "Summary must be at least 10 characters"),
  country: z.string().min(2, "Country is required"),
  region: z.string().min(2, "Region is required"),
  latitude: z.string().refine((v) => !isNaN(Number(v)), "Must be a valid number"),
  longitude: z.string().refine((v) => !isNaN(Number(v)), "Must be a valid number"),
  category: z.string(),
  riskLevel: z.string(),
  verificationStatus: z.string(),
  sourceName: z.string().min(2, "Source name is required"),
  sourceUrl: z.string().url("Must be a valid URL"),
});

type EventFormValues = z.infer<typeof eventSchema>;

export function EventForm() {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: "",
      summary: "",
      country: "",
      region: "",
      latitude: "",
      longitude: "",
      category: "conflict",
      riskLevel: "medium",
      verificationStatus: "unverified",
      sourceName: "",
      sourceUrl: "",
    },
  });

  function onSubmit(values: EventFormValues) {
    console.log(values);
    toast.success("Intelligence event added to database", {
      description: "Data will be visible to operators once final verification completes."
    });
    reset();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Field className="col-span-full">
          <FieldLabel htmlFor="title">Event Title</FieldLabel>
          <FieldContent>
            <Input id="title" placeholder="e.g., Strategic Movement in Donbas Sector" {...register("title")} />
            <FieldError errors={[{ message: errors.title?.message }]} />
          </FieldContent>
        </Field>

        <Field className="col-span-full">
          <FieldLabel htmlFor="summary">Executive Summary</FieldLabel>
          <FieldContent>
            <Textarea 
              id="summary"
              placeholder="Brief tactical overview..." 
              className="h-20"
              {...register("summary")} 
            />
            <FieldError errors={[{ message: errors.summary?.message }]} />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="country">Country</FieldLabel>
          <FieldContent>
            <Input id="country" placeholder="Ukraine" {...register("country")} />
            <FieldError errors={[{ message: errors.country?.message }]} />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="region">Specific Region / Oblast</FieldLabel>
          <FieldContent>
            <Input id="region" placeholder="Donetsk" {...register("region")} />
            <FieldError errors={[{ message: errors.region?.message }]} />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="latitude">Latitude</FieldLabel>
          <FieldContent>
            <Input id="latitude" placeholder="48.0196" {...register("latitude")} />
            <FieldError errors={[{ message: errors.latitude?.message }]} />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="longitude">Longitude</FieldLabel>
          <FieldContent>
            <Input id="longitude" placeholder="37.8028" {...register("longitude")} />
            <FieldError errors={[{ message: errors.longitude?.message }]} />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="category">Category</FieldLabel>
          <FieldContent>
            <Controller
              name="category"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[{ message: errors.category?.message }]} />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="riskLevel">Risk Level</FieldLabel>
          <FieldContent>
            <Controller
              name="riskLevel"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger id="riskLevel">
                    <SelectValue placeholder="Select risk level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[{ message: errors.riskLevel?.message }]} />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="sourceName">Primary Source Name</FieldLabel>
          <FieldContent>
            <Input id="sourceName" placeholder="e.g., Reuters" {...register("sourceName")} />
            <FieldError errors={[{ message: errors.sourceName?.message }]} />
          </FieldContent>
        </Field>

        <Field>
          <FieldLabel htmlFor="sourceUrl">Primary Source URL</FieldLabel>
          <FieldContent>
            <Input id="sourceUrl" placeholder="https://..." {...register("sourceUrl")} />
            <FieldError errors={[{ message: errors.sourceUrl?.message }]} />
          </FieldContent>
        </Field>
      </div>

      <div className="pt-4 flex gap-4">
        <Button type="submit" size="lg" className="px-8 font-bold" disabled={isSubmitting}>
          PUBLISH INTELLIGENCE
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={() => reset()}>
          DISCARD
        </Button>
      </div>
    </form>
  );
}
