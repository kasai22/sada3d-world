"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ProductFormState } from "@/components/ops/product/ProductForm";
import { checkConsumptionLines, replaceProductConsumption } from "@/lib/inventory/consumption";
import { parseConsumptionLines } from "@/lib/inventory/consumption-rules";
import { currentOperator } from "@/lib/ops/operator";
import { createProduct } from "@/lib/ops/product-admin";
import { PRODUCT_SECTIONS, parseProductForm } from "@/lib/ops/product-form";

/**
 * Creates a product from the Reality 3D create page.
 *
 * A public POST endpoint, so it resolves the operator itself: a customer or an
 * anonymous caller gets "Unauthorized." and nothing is written. Malformed input
 * never reaches the CMS. On success the operator lands on the new product's
 * workspace, inside the admin.
 *
 * Stage 22.7: the Production & Consumption lines are checked before the product
 * is created, then saved against its catalog id. They are a reference only —
 * no stock moves.
 */
export async function createProductAction(_previous: ProductFormState, form: FormData): Promise<ProductFormState> {
  const operator = await currentOperator();
  if (!operator) return { status: "error", message: "Unauthorized.", at: Date.now() };

  const consumption = form.get("consumption");
  const { values, errors } = parseProductForm(form, PRODUCT_SECTIONS);
  const shape = parseConsumptionLines(consumption);
  const lineCheck = Object.keys(shape.errors).length === 0 && !shape.problem ? await checkConsumptionLines(operator, consumption) : null;
  const consumptionErrors = lineCheck && !lineCheck.ok ? lineCheck.errors : shape.errors;
  const consumptionProblem = shape.problem ?? (lineCheck && !lineCheck.ok && Object.keys(lineCheck.errors).length === 0 ? lineCheck.message : undefined);

  if (Object.keys(errors).length > 0 || Object.keys(consumptionErrors).length > 0 || consumptionProblem) {
    return {
      status: "error",
      message: consumptionProblem ?? "Some fields need attention.",
      errors,
      consumptionErrors,
      values,
      at: Date.now(),
    };
  }

  const result = await createProduct(operator, values);
  if (!result.ok) return { status: "error", message: result.message, errors: result.errors, values, at: Date.now() };

  let consumptionSaved = true;
  if (shape.lines.length > 0) {
    const saved = result.productId ? await replaceProductConsumption(operator, result.productId, consumption).catch(() => null) : null;
    consumptionSaved = Boolean(saved?.ok);
  }

  revalidatePath("/admin/products");
  redirect(`/admin/products/${result.id}?created=1${consumptionSaved ? "" : "&consumption=unsaved&tab=production"}`);
}
