import sys
import joblib

model = joblib.load("importance_model.pkl")
vectorizer = joblib.load("importance_vectorizer.pkl")

text = " ".join(sys.argv[1:])

X = vectorizer.transform([text])

probability = model.predict_proba(X)[0][1]

if probability >= 0.75:
    level = "high"

elif probability >= 0.50:
    level = "medium"

else:
    level = "normal"

print({
    "importanceScore": round(probability * 100, 2),
    "importanceLevel": level
})