import { describe, expect, it } from "vitest"
import { makeProjectFilter } from "../electron/eod-ai-filter"

describe("makeProjectFilter", () => {
  describe("blocklist: report everything except what is listed", () => {
    it("keeps a path that is not listed", () => {
      const keep = makeProjectFilter("blocklist", ["C:/secret"])
      expect(keep("C:/repos/app")).toBe(true)
    })

    it("excludes a listed path", () => {
      const keep = makeProjectFilter("blocklist", ["C:/secret"])
      expect(keep("C:/secret")).toBe(false)
    })

    it("excludes everything beneath a listed path", () => {
      const keep = makeProjectFilter("blocklist", ["C:/secret"])
      expect(keep("C:/secret/inner/project")).toBe(false)
    })

    it("does not treat a name that merely starts the same as a match", () => {
      // C:/secretive is a different project from C:/secret.
      const keep = makeProjectFilter("blocklist", ["C:/secret"])
      expect(keep("C:/secretive")).toBe(true)
    })

    it("keeps everything when nothing is listed", () => {
      const keep = makeProjectFilter("blocklist", [])
      expect(keep("C:/anything")).toBe(true)
    })

    it("keeps a path it cannot identify", () => {
      const keep = makeProjectFilter("blocklist", ["C:/secret"])
      expect(keep("")).toBe(true)
    })
  })

  describe("allowlist: report only what is listed", () => {
    it("keeps a listed path", () => {
      const keep = makeProjectFilter("allowlist", ["C:/repos/app"])
      expect(keep("C:/repos/app")).toBe(true)
    })

    it("keeps everything beneath a listed path", () => {
      const keep = makeProjectFilter("allowlist", ["C:/repos"])
      expect(keep("C:/repos/app/sub")).toBe(true)
    })

    it("excludes a path that is not listed", () => {
      const keep = makeProjectFilter("allowlist", ["C:/repos/app"])
      expect(keep("C:/other")).toBe(false)
    })

    it("excludes everything when nothing is listed", () => {
      // Fail safe: an empty allowlist must leak nothing, not everything.
      const keep = makeProjectFilter("allowlist", [])
      expect(keep("C:/anything")).toBe(false)
    })

    it("excludes a path it cannot identify", () => {
      // A new or unrecognised project stays hidden until it is chosen.
      const keep = makeProjectFilter("allowlist", ["C:/repos/app"])
      expect(keep("")).toBe(false)
    })
  })

  describe("path comparison", () => {
    it("ignores the difference between slash styles", () => {
      const keep = makeProjectFilter("blocklist", ["C:/secret/project"])
      expect(keep("C:\\secret\\project")).toBe(false)
    })

    it("ignores case, as Windows paths do", () => {
      const keep = makeProjectFilter("blocklist", ["C:/Secret"])
      expect(keep("c:/SECRET/app")).toBe(false)
    })

    it("ignores a trailing separator", () => {
      const keep = makeProjectFilter("blocklist", ["C:/secret/"])
      expect(keep("C:/secret")).toBe(false)
    })

    it("ignores blank entries in the list", () => {
      const keep = makeProjectFilter("blocklist", ["", "   "])
      expect(keep("C:/anything")).toBe(true)
    })
  })
})
