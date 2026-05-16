✦ To decouple artist creation from Spotify, you need to shift the AI's mental model from "Spotify-First" to
  "Artist-First."

  Since you've already updated CURRENT_STATE.md, Qwen will see the goal. Here is the exact strategy and prompt sequence
  you should use to guide the AI through this transition.


  ive updated CURRENT_STATE.md. Run ./scripts/ai-context.sh to get the latest bundle. I want to decouple artist
  creation from Spotify. Start by creating a plan in .ai/plans/decouple-spotify.md that addresses the database schema and
  the generic create endpoint.


  The Strategy (The "What")
   1. Database: Make spotify_id and other platform-specific fields nullable.
   2. API: Create a generic "Create Artist" endpoint in the Python data-api that only requires a name.
   3. Flow: Change the logic so you can create a "Base Artist" record first, then "Link" platform IDs (Spotify, YouTube)
      to it later.

  ---

  The Prompts (The "How")

  Step 1: The Planning Phase (Critical)
  
  Read .ai/context/current_bundle.md. Our goal is to decouple artist creation from Spotify. Right now, an artist
  record depends on a Spotify search.
  >
  > Please analyze the current database schema (schema.sql) and the data-api insertion logic. Then, create a detailed
  implementation plan in .ai/plans/decouple-artist-creation.md.
  >
  > The plan should cover:
  > 1. Database schema updates (making platform IDs nullable).
  > 2. A new 'Generic Create' endpoint in the Python API.
  > 3. How the frontend 'Add Artist' flow will change to allow adding by Name only.

  ---

  Step 2: The Logic Phase (Implementation)
  Once you review and approve the plan, tell the AI to execute the backend first.

  > Prompt:
  > "Excellent plan. Let's execute the backend changes first.
  > 1. Update schema.sql.
  > 2. Modify the Python data-api to support creating an artist with just a name.
  > 3. Update the insertion logic to handle cases where Spotify data is missing.
  >
  > Run ./scripts/verify.sh when done to ensure the API still starts."

  ---

  Step 3: The UI Phase
  Finally, update the frontend to use the new "Artist-First" logic.

  > Prompt:
  > "Now that the API supports generic artists, let's update the Next.js frontend.
  > 1. Modify the 'Add Artist' UI to have a 'Manual Add' or 'Quick Add' option that doesn't require a Spotify search.
  > 2. Ensure the Artist Card and Detail pages handle artists that don't have Spotify IDs yet without crashing."

  ---

  Why this works:
   * The Plan first: By forcing it to write a plan in .ai/plans/, you can spot if it's about to do something destructive
     (like deleting the Spotify integration entirely) before it happens.
   * Decoupling the Task: By doing Backend first, then Frontend, you ensure the "plumbing" is ready before you change the
     "faucets."
   * Maintenance: Qwen will (per its rules) update TASKS.md and CURRENT_STATE.md as it finishes these steps, keeping your
     workspace in sync.