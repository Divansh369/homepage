import csv

def read_csv(file_name):
    with open(file_name, mode='r') as file:
        reader = csv.reader(file)
        rows = list(reader)
    return rows

def write_csv(file_name, rows):
    with open(file_name, mode='w', newline='') as file:
        writer = csv.writer(file)
        writer.writerows(rows)

def get_row_by_project_name(rows, project_name):
    for i, row in enumerate(rows):
        if row[0] == project_name:
            return i
    return None

def move_row(rows, current_index, target_index):
    # Pop the row from its current position
    row_to_move = rows.pop(current_index)
    
    # Insert it at the new target position
    rows.insert(target_index, row_to_move)

def main():
    file_name = "projects.csv"  # CSV file name
    rows = read_csv(file_name)
    
    # Get headers
    headers = rows[0]
    
    # Print the available project names (excluding header)
    print("Available projects:")
    for i, row in enumerate(rows[1:], start=1):
        print(f"{i}. {row[0]}")  # Project name is assumed to be in the first column

    # Ask user for project name to move
    project_name = input("\nEnter the project name you want to move: ")

    current_index = get_row_by_project_name(rows, project_name)
    if current_index is None:
        print(f"Project {project_name} not found.")
        return

    print(f"\nProject {project_name} found at row {current_index}.")

    # Ask user for target row to insert (1-based index)
    try:
        target_index = int(input(f"Enter the target row (1 to {len(rows)}) where you want to move {project_name}: ")) - 1
        if target_index < 0 or target_index >= len(rows):
            print("Invalid row number.")
            return
    except ValueError:
        print("Invalid input. Please enter a valid row number.")
        return

    # Ensure we don't move the row to its current position
    if current_index == target_index:
        print("Row is already at the target position. No change made.")
        return

    # Move the row
    move_row(rows, current_index, target_index+1)

    # Write the modified rows back to the CSV
    write_csv(file_name, rows)

    print(f"\nProject {project_name} moved successfully to row {target_index + 1}.")

if __name__ == "__main__":
    main()
