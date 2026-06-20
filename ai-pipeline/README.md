\# AI Data Pipeline



\## Overview



This module implements a basic AI Data Pipeline for the GeoAtlas platform.



The pipeline collects news articles from RSS feeds, extracts structured event information, assigns risk scores, and generates JSON output for downstream intelligence systems.



\## Features



\* RSS Feed Collection

\* Rule-Based Event Extraction

\* Event Categorization

\* Risk Scoring Engine

\* Structured JSON Event Generation



\## Project Structure



```text

ai-pipeline/

│

├── app.py

├── rss\_collector.py

├── ai\_extractor.py

├── risk\_engine.py

├── requirements.txt

└── README.md

```



\## Installation



```bash

pip install -r requirements.txt

```



\## Run



```bash

python app.py

```



\## Output



The pipeline generates structured events in JSON format containing:



\* Event ID

\* Title

\* Country

\* Category

\* Risk Score

\* Risk Level

\* Source Information



\## Future Improvements



\* LLM-based Event Extraction

\* Multi-source Aggregation

\* Named Entity Recognition (NER)

\* Event Verification Engine

\* Advanced Risk Scoring Models



