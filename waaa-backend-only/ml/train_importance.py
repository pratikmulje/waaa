import pandas as pd
import joblib

from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report

# Load dataset
df = pd.read_csv("importance_dataset.csv")

# Remove empty rows
df = df.dropna(subset=["text", "label"])

X = df["text"]
y = df["label"]

# Split dataset
X_train, X_test, y_train, y_test = train_test_split(
    X,
    y,
    test_size=0.2,
    random_state=42,
    stratify=y
)

# Convert text → numbers
vectorizer = TfidfVectorizer(
    lowercase=True,
    ngram_range=(1, 2),
    max_features=10000
)

X_train_vec = vectorizer.fit_transform(X_train)
X_test_vec = vectorizer.transform(X_test)

# Train model
model = LogisticRegression(
    max_iter=1000,
    class_weight="balanced"
)

model.fit(X_train_vec, y_train)

# Test
predictions = model.predict(X_test_vec)

print("\n===== MODEL PERFORMANCE =====\n")
print(classification_report(y_test, predictions))

# Save
joblib.dump(model, "importance_model.pkl")
joblib.dump(vectorizer, "importance_vectorizer.pkl")

print("\n✅ Importance model saved")