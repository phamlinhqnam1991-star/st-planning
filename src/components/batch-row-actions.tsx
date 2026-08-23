"use client";

import { useState } from "react";

type Recipe = {
  recipe_key: string;
  recipe_no: string | null;
  recipe_name: string | null;
  process_family: string | null;
  recipe_group: string | null;
};

type Props = {
  batchId: number;
  batchNo: string;
  currentRecipeKey: string | null;
};

export function BatchRowActions({
  batchId,
  batchNo,
  currentRecipeKey,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipeKey, setRecipeKey] = useState(currentRecipeKey || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function openEdit() {
    setMessage("");

    if (editing) {
      setEditing(false);
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(`/api/planning/batch/${batchId}`, {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Không tải được Recipe.");
      }

      setRecipes(data.recipes || []);
      setRecipeKey(data.batch?.recipe_key || "");
      setEditing(true);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Không tải được Recipe."
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveRecipe() {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`/api/planning/batch/${batchId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          recipe_key: recipeKey || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Không sửa được Recipe.");
      }

      window.location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Không sửa được Recipe."
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteBatch() {
    const confirmed = window.confirm(
      `Xóa ${batchNo}?\\n\\nTất cả Job trong lô sẽ trở về trạng thái chưa có lô để có thể lập lô lại.`
    );

    if (!confirmed) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`/api/planning/batch/${batchId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Không xóa được Batch.");
      }

      window.location.reload();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Không xóa được Batch."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="batch-row-actions">
      <div className="batch-row-buttons">
        <button
          className="btn small"
          type="button"
          disabled={busy}
          onClick={openEdit}
        >
          {editing ? "Close" : "Edit Recipe"}
        </button>

        <button
          className="btn small danger-btn"
          type="button"
          disabled={busy}
          onClick={deleteBatch}
        >
          Delete
        </button>
      </div>

      {editing ? (
        <div className="batch-recipe-editor">
          <select
            className="input"
            value={recipeKey}
            onChange={(event) => setRecipeKey(event.target.value)}
          >
            <option value="">No Recipe</option>

            {recipes.map((recipe) => (
              <option key={recipe.recipe_key} value={recipe.recipe_key}>
                {recipe.recipe_no || "—"} ·{" "}
                {recipe.recipe_name || "CHƯA KHAI BÁO"}
              </option>
            ))}
          </select>

          <button
            className="btn primary small"
            type="button"
            disabled={busy}
            onClick={saveRecipe}
          >
            Save
          </button>
        </div>
      ) : null}

      {message ? (
        <small className="batch-action-error">{message}</small>
      ) : null}
    </div>
  );
}
