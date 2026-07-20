/**
 * Registers every Search Engine source as a side effect of import. A new
 * entity is onboarded by creating one file under sources/ (module, icon,
 * indexed fields, route — see types.ts's SearchSource) and adding its
 * import here. engine.ts and the API route never change.
 */
import "./activities";
import "./tickets";
import "./projects";
import "./companies";
import "./contacts";
import "./recurring";
import "./knowledge";
import "./help";
import "./reports";
import "./users";
import "./views";
import "./attachments";
import "./indicators";
import "./settings";
import "./actions";
