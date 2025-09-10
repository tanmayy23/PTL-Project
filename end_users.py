import pandas as pd
import psycopg2
import re

# Database connection parameters
db_params = {
    'dbname': 'ptl_db',
    'user': 'postgres',
    'password': 'banas',
    'host': 'localhost',
    'port': '5432'
}

# Excel file path
excel_file = r'C:\Users\acer\Downloads\User Section detail of Purchase requisitioners.xlsx'

# Default password for all users (plain text)
default_password = 'admin'

try:
    # Read Excel file
    xl = pd.ExcelFile(excel_file)
    print("Available sheets:", xl.sheet_names)
    df = pd.read_excel(excel_file, sheet_name=0, header=0)

    # Print column names for debugging
    print("Column names found:", df.columns.tolist())

    # Define expected column names
    column_mapping = {
        'Purchase Requisitioners': 'Purchase Requisitioners',
        'Sections': 'Sections',
        'E-mail ID': 'E-mail ID',
        'Mobile number': 'Mobile number',
        'Employee ID': 'Employee ID'
    }

    # Verify required columns exist
    missing_columns = [col for col in column_mapping.values() if col not in df.columns]
    if missing_columns:
        raise ValueError(f"Missing columns in Excel file: {missing_columns}")

    # Connect to PostgreSQL
    conn = psycopg2.connect(**db_params)
    cursor = conn.cursor()

    # Track inserted rows
    inserted_count = 0
    skipped_rows = []

    # Process data
    for index, row in df.iterrows():
        # Extract and clean fields
        username = str(row[column_mapping['Purchase Requisitioners']]).strip()
        section = str(row[column_mapping['Sections']]).strip() if pd.notnull(row[column_mapping['Sections']]) else None
        email = str(row[column_mapping['E-mail ID']]).strip() if pd.notnull(row[column_mapping['E-mail ID']]) else None
        mobile = str(row[column_mapping['Mobile number']]).strip() if pd.notnull(row[column_mapping['Mobile number']]) else None
        employee_id = str(row[column_mapping['Employee ID']]).strip() if pd.notnull(row[column_mapping['Employee ID']]) and str(row[column_mapping['Employee ID']]) != 'nan' else None

        # Skip rows with missing username
        if not username or username == 'nan':
            skipped_rows.append(f"Row {index + 2}: Missing username")
            continue

        # Validate username (letters, spaces, and periods only)
        if not re.match(r'^[A-Za-z\s.]+$', username):
            skipped_rows.append(f"Row {index + 2}: Invalid username '{username}' (must contain only letters, spaces, or periods)")
            continue

        # Clean and validate email
        if email:
            email = re.sub(r'[\'"]', '', email)
            if not re.match(r'^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$', email):
                skipped_rows.append(f"Row {index + 2}: Invalid email '{email}'")
                continue

        # Clean mobile number (strip whitespace only, allow any format)
        if mobile:
            mobile = mobile.strip()

        # Insert into end_users table
        insert_query = """
            INSERT INTO end_users (username, section, email, mobile, employee_id, password)
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        try:
            cursor.execute(insert_query, (username, section, email, mobile, employee_id, default_password))
            inserted_count += cursor.rowcount
        except psycopg2.Error as e:
            skipped_rows.append(f"Row {index + 2}: Database error for user '{username}': {e}")
            conn.rollback()
            continue

    # Commit the transaction
    conn.commit()
    print(f"Data imported successfully: {inserted_count} rows inserted into end_users table")
    if skipped_rows:
        print("Skipped rows:")
        for skip in skipped_rows:
            print(skip)

except Exception as e:
    print(f"Error: {e}")
    if 'conn' in locals():
        conn.rollback()

finally:
    if 'cursor' in locals():
        cursor.close()
    if 'conn' in locals():
        conn.close()