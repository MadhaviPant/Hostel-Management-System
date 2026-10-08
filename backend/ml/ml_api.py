from flask import Flask, request, jsonify
import pandas as pd
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.model_selection import train_test_split

app = Flask(__name__)

# Load dataset
data = pd.read_csv('complaints_dataset.csv')

# Remove empty rows
data = data.dropna()

# Ensure all descriptions are strings
data['description'] = data['description'].astype(str)

X = data['description']
y = data['category']

# Train-test split (IMPORTANT for viva)
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

# Vectorize
vectorizer = CountVectorizer()
X_train_vec = vectorizer.fit_transform(X_train)

# Train model
model = MultinomialNB()
model.fit(X_train_vec, y_train)

@app.route('/predict', methods=['POST'])
def predict():
    text = request.json['text']
    X_input = vectorizer.transform([text])
    prediction = model.predict(X_input)[0]

    return jsonify({"category": prediction})

if __name__ == '__main__':
    app.run(port=5000)