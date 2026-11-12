# Privacy: Region Filter for X

Region Filter for X collects nothing and tracks nothing. It has no analytics, no remote configuration and no remote code, and it has no server of its own.

**What it stores, only in your browser (extension storage):**
- your settings: on/off, how posts are hidden, the regions you picked, the accounts you chose to always show;
- a cache of X handles and the region X showed for them, with the date, so each account is looked up about once a month (entries expire after 30 days, or 1 day if X showed no region);
- a counter of how many posts were hidden, shown in the popup;
- the times of the lookups in the last hour and whether lookups are paused, so the hourly limit holds across tabs;
- whether you closed the W flow link in the popup.

**What it sends, and where:** only requests to X. From your x.com tab, it asks X's own "About this account" endpoint for the region of accounts whose posts you are viewing, using your existing X session, as X's own web app does. To find the current version of that endpoint it reads X's own script files from abs.twimg.com, which the X page has already loaded. Nothing goes to the developer or to anyone else.

**Links:** the popup has a link to w-flow.tech. It only says where the click came from (`utm_source=x-region-filter`), nothing about you, and nothing is sent unless you click it.

Removing the extension deletes everything it stored.
