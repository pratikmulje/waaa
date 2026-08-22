import sys
import joblib

model = joblib.load("fraud_model.pkl")
vectorizer = joblib.load("tfidf_vectorizer.pkl")

text = sys.argv[1]

X = vectorizer.transform([text])

probability = model.predict_proba(X)[0][1]

print(probability)