"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { registerPortalAccount } from "@/lib/portal-api";

const schema = z.object({
  full_name: z.string().min(2, "Enter your full name."),
  email: z.string().email("Enter a valid email address."),
  organization: z.string().min(2, "Enter your organization."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type Values = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: "", email: "", organization: "", password: "" },
  });

  const onSubmit = async (values: Values) => {
    try {
      await registerPortalAccount(values);
      toast.success("Account created");
      router.replace("/portal");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to create account.");
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-4 py-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">GeoAtlas commercial API</p>
          <h1 className="text-5xl font-bold tracking-tight">Create your API customer account.</h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Start on the free tier, generate your key, and prepare for production access as the commercial product expands.
          </p>
        </div>
        <Card className="border-border/70 shadow-xl">
          <CardHeader>
            <CardTitle>Create account</CardTitle>
            <CardDescription>The first registered user becomes the bootstrap admin for this environment.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <Field>
                <FieldLabel htmlFor="full_name">Full name</FieldLabel>
                <FieldContent>
                  <Input id="full_name" {...form.register("full_name")} placeholder="Ahan Sardar" />
                  <FieldError errors={[{ message: form.formState.errors.full_name?.message }]} />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <FieldContent>
                  <Input id="email" {...form.register("email")} placeholder="you@company.com" />
                  <FieldError errors={[{ message: form.formState.errors.email?.message }]} />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="organization">Organization</FieldLabel>
                <FieldContent>
                  <Input id="organization" {...form.register("organization")} placeholder="GeoAtlas Labs" />
                  <FieldError errors={[{ message: form.formState.errors.organization?.message }]} />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <FieldContent>
                  <Input id="password" type="password" {...form.register("password")} placeholder="••••••••" />
                  <FieldError errors={[{ message: form.formState.errors.password?.message }]} />
                </FieldContent>
              </Field>
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                Create account
              </Button>
            </form>
            <p className="mt-4 text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
