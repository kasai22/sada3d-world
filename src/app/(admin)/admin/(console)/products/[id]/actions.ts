"use server";

import { revalidatePath } from "next/cache";

import type { ConsumptionFormState } from "@/components/ops/product/ConsumptionForm";
import type { ProductFormState } from "@/components/ops/product/ProductForm";
import { currentOperator } from "@/lib/ops/operator";
import { replaceProductConsumption } from "@/lib/inventory/consumption";
import { catalogIdOf, updateProductSection } from "@/lib/ops/product-admin";
import { PRODUCT_SECTIONS, parseProductForm, type ProductSection } from "@/lib/ops/product-form";

/**
 * Saves one section of the product workspace.
 *
 * A public POST endpoint, so it resolves the operator itself; the service then
 * saves as the signed-in Payload user, with Payload's access control and every
 * product hook applied. The bound product id and section are checked again —
 * a client can send anything.
 */
export async function updateProductSectionAction(
  productId: number,
  section: ProductSection,
  _previous: ProductFormState,
  form: FormData,
): Promise<ProductFormState> {
  const operator = await currentOperator();
  if (!operator) return { status: "error", message: "Unauthorized.", at: Date.now() };
  if (!PRODUCT_SECTIONS.includes(section) || !Number.isSafeInteger(productId) || productId <= 0) {
    return { status: "error", message: "That product section does not exist.", at: Date.now() };
  }

  const { values, errors } = parseProductForm(form, [section]);
  if (Object.keys(errors).length > 0) {
    return { status: "error", message: "Some fields need attention.", errors, values, at: Date.now() };
  }

  const result = await updateProductSection(operator, productId, section, values);
  if (!result.ok) return { status: "error", message: result.message, errors: result.errors, values, at: Date.now() };

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
  return { status: "saved", message: result.message, at: Date.now() };
}

/**
 * Saves a product's Production & Consumption lines (Stage 22.7).
 *
 * Checks the operator itself, resolves the product's catalog id on the server
 * (the form never supplies it), and replaces the lines in one transaction.
 * Nothing about the product's approval, price or stock changes.
 */
export async function saveConsumptionAction(
  productId: number,
  _previous: ConsumptionFormState,
  form: FormData,
): Promise<ConsumptionFormState> {
  const operator = await currentOperator();
  if (!operator) return { status: "error", message: "Unauthorized.", at: Date.now() };

  const catalogId = await catalogIdOf(operator, productId);
  if (!catalogId) return { status: "error", message: "That product does not exist.", at: Date.now() };

  try {
    const result = await replaceProductConsumption(operator, catalogId, form.get("consumption"));
    if (!result.ok) return { status: "error", message: result.message, errors: result.errors, at: Date.now() };
    revalidatePath(`/admin/products/${productId}`);
    return { status: "saved", message: result.message, at: Date.now() };
  } catch {
    return { status: "error", message: "The lines could not be saved. Reload the page to see what is stored, then try again.", at: Date.now() };
  }
}
