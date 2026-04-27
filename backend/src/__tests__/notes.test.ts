import { beforeEach, describe, expect, it } from "vitest";
import type { Hono } from "hono";
import type Database from "better-sqlite3";
import { createTestApp } from "./helpers/test-app";

let app: Hono;
let sqlite: Database.Database;

beforeEach(() => {
  const test = createTestApp();
  app = test.app;
  sqlite = test.sqlite;
});

describe("Notes routes", () => {
  it("seeds default categories for a new user", async () => {
    sqlite.exec("DELETE FROM note_categories");

    const res = await app.request("/api/notes/categories");
    expect(res.status).toBe(200);
    const categories = (await res.json()) as Array<{ name: string }>;
    const names = categories.map((item) => item.name).sort();
    expect(names).toEqual(["Ideas", "Personal", "Work"]);
  });

  it("rejects note creation when title is empty", async () => {
    const res = await app.request("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", content: "Text body" }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Validation error");
  });

  it("supports note list search, category filtering, and updatedAt sorting", async () => {
    sqlite.exec("DELETE FROM notes");
    sqlite.exec("DELETE FROM note_categories");

    const categoryRes = await app.request("/api/notes/categories");
    const categories = (await categoryRes.json()) as Array<{ id: string; name: string }>;
    const workCategory = categories.find((item) => item.name === "Work");
    const personalCategory = categories.find((item) => item.name === "Personal");
    expect(workCategory).toBeDefined();
    expect(personalCategory).toBeDefined();

    const firstRes = await app.request("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Project Phoenix",
        content: "Architecture and CI planning",
        categoryId: workCategory?.id,
      }),
    });
    expect(firstRes.status).toBe(201);
    const first = (await firstRes.json()) as { id: string };

    const secondRes = await app.request("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Grocery List",
        content: "Milk and eggs",
        categoryId: personalCategory?.id,
      }),
    });
    expect(secondRes.status).toBe(201);
    const second = (await secondRes.json()) as { id: string };

    const updateRes = await app.request(`/api/notes/${first.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Architecture v2 plan" }),
    });
    expect(updateRes.status).toBe(200);

    const listRes = await app.request("/api/notes");
    expect(listRes.status).toBe(200);
    const allNotes = (await listRes.json()) as Array<{ id: string; updatedAt: string }>;
    expect(allNotes.length).toBe(2);
    const noteIds = new Set(allNotes.map((note) => note.id));
    expect(noteIds.has(first.id)).toBe(true);
    expect(noteIds.has(second.id)).toBe(true);
    expect(new Date(allNotes[0].updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(allNotes[1].updatedAt).getTime(),
    );

    const searchRes = await app.request("/api/notes?q=grocery");
    expect(searchRes.status).toBe(200);
    const searchNotes = (await searchRes.json()) as Array<{ id: string }>;
    expect(searchNotes.length).toBe(1);
    expect(searchNotes[0]?.id).toBe(second.id);

    const filterRes = await app.request(`/api/notes?categoryId=${encodeURIComponent(workCategory!.id)}`);
    expect(filterRes.status).toBe(200);
    const filtered = (await filterRes.json()) as Array<{ id: string }>;
    expect(filtered.length).toBe(1);
    expect(filtered[0]?.id).toBe(first.id);
  });

  it("nulls note category when deleting a category", async () => {
    sqlite.exec("DELETE FROM notes");
    sqlite.exec("DELETE FROM note_categories");

    const categoryCreateRes = await app.request("/api/notes/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Meeting" }),
    });
    expect(categoryCreateRes.status).toBe(201);
    const category = (await categoryCreateRes.json()) as { id: string };

    const noteCreateRes = await app.request("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Q1 Review",
        content: "Budget approved",
        categoryId: category.id,
      }),
    });
    expect(noteCreateRes.status).toBe(201);
    const note = (await noteCreateRes.json()) as { id: string; categoryId: string | null };
    expect(note.categoryId).toBe(category.id);

    const deleteCategoryRes = await app.request(`/api/notes/categories/${category.id}`, {
      method: "DELETE",
    });
    expect(deleteCategoryRes.status).toBe(200);

    const noteRes = await app.request(`/api/notes/${note.id}`);
    expect(noteRes.status).toBe(200);
    const updated = (await noteRes.json()) as { categoryId: string | null; categoryName: string | null };
    expect(updated.categoryId).toBeNull();
    expect(updated.categoryName).toBeNull();
  });

  it("hard deletes notes", async () => {
    sqlite.exec("DELETE FROM notes");

    const createRes = await app.request("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Temporary", content: "Delete me" }),
    });
    expect(createRes.status).toBe(201);
    const note = (await createRes.json()) as { id: string };

    const deleteRes = await app.request(`/api/notes/${note.id}`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);

    const getRes = await app.request(`/api/notes/${note.id}`);
    expect(getRes.status).toBe(404);
  });

  it("supports pin/unpin and pinned list filters", async () => {
    sqlite.exec("DELETE FROM notes");

    const firstRes = await app.request("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Zeta Note", content: "Pinned candidate" }),
    });
    expect(firstRes.status).toBe(201);
    const first = (await firstRes.json()) as { id: string };

    const secondRes = await app.request("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Alpha Note", content: "Unpinned" }),
    });
    expect(secondRes.status).toBe(201);
    const second = (await secondRes.json()) as { id: string };

    const pinRes = await app.request(`/api/notes/${first.id}/pin`, { method: "PATCH" });
    expect(pinRes.status).toBe(200);
    const pinned = (await pinRes.json()) as { isPinned: boolean };
    expect(pinned.isPinned).toBe(true);

    const sortedRes = await app.request("/api/notes?sort=title_asc");
    expect(sortedRes.status).toBe(200);
    const sorted = (await sortedRes.json()) as Array<{ id: string }>;
    expect(sorted[0]?.id).toBe(first.id);
    expect(sorted[1]?.id).toBe(second.id);

    const pinnedOnlyRes = await app.request("/api/notes?pinnedOnly=true");
    expect(pinnedOnlyRes.status).toBe(200);
    const pinnedOnly = (await pinnedOnlyRes.json()) as Array<{ id: string }>;
    expect(pinnedOnly.length).toBe(1);
    expect(pinnedOnly[0]?.id).toBe(first.id);

    const unpinRes = await app.request(`/api/notes/${first.id}/unpin`, { method: "PATCH" });
    expect(unpinRes.status).toBe(200);
    const unpinned = (await unpinRes.json()) as { isPinned: boolean };
    expect(unpinned.isPinned).toBe(false);
  });

  it("hides archived notes by default and returns them when requested", async () => {
    sqlite.exec("DELETE FROM notes");

    const createRes = await app.request("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Archive Me", content: "Temporary archive" }),
    });
    expect(createRes.status).toBe(201);
    const note = (await createRes.json()) as { id: string };

    const archiveRes = await app.request(`/api/notes/${note.id}/archive`, { method: "PATCH" });
    expect(archiveRes.status).toBe(200);
    const archived = (await archiveRes.json()) as { archivedAt: string | null; isPinned: boolean };
    expect(archived.archivedAt).toBeTruthy();
    expect(archived.isPinned).toBe(false);

    const defaultListRes = await app.request("/api/notes");
    expect(defaultListRes.status).toBe(200);
    const defaultList = (await defaultListRes.json()) as Array<{ id: string }>;
    expect(defaultList.some((item) => item.id === note.id)).toBe(false);

    const includeArchivedRes = await app.request("/api/notes?includeArchived=true");
    expect(includeArchivedRes.status).toBe(200);
    const includeArchived = (await includeArchivedRes.json()) as Array<{ id: string }>;
    expect(includeArchived.some((item) => item.id === note.id)).toBe(true);

    const unarchiveRes = await app.request(`/api/notes/${note.id}/unarchive`, { method: "PATCH" });
    expect(unarchiveRes.status).toBe(200);
    const unarchived = (await unarchiveRes.json()) as { archivedAt: string | null };
    expect(unarchived.archivedAt).toBeNull();
  });
});
